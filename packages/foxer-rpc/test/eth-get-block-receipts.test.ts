import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import { streamEthGetBlockReceipts } from '../src/api/json-rpc/methods/eth-get-block-receipts-stream.ts'
import { streamJsonRpc } from '../src/api/json-rpc/stream.ts'
import { StreamCapacityLimiter } from '../src/api/json-rpc/stream-capacity.ts'
import { type Database, receiptTransactionColumns } from '../src/db/client.ts'
import { schema } from '../src/db/schema/index.ts'
import {
  block1,
  block2,
  blockRow,
  createReceiptTestApi,
  logRow,
  seedReceipts,
  transactionRow,
  tx1,
  tx2,
  tx3,
} from './fixtures/receipts.ts'
import { bytes32, withTestDatabase } from './helpers.ts'

describe('eth_getBlockReceipts', () => {
  test('receipt selections omit transaction calldata and unrelated columns', () => {
    expect(Object.keys(receiptTransactionColumns).sort()).toEqual([
      'blockNumber',
      'contractAddress',
      'cumulativeGasUsed',
      'effectiveGasPrice',
      'from',
      'hash',
      'logsBloom',
      'receiptGasUsed',
      'status',
      'to',
      'transactionIndex',
      'type',
    ])
  })

  test('resolves block numbers, tags, and hashes', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      const app = createReceiptTestApi(db)

      const byNumber = await rpc(app, '0x1')
      if (!byNumber.result) throw new Error('expected receipts by number')
      expect(byNumber.result.map((receipt) => receipt.transactionHash)).toEqual(
        [tx1]
      )

      const byLatest = await rpc(app, 'latest')
      if (!byLatest.result) throw new Error('expected latest receipts')
      expect(byLatest.result.map((receipt) => receipt.transactionHash)).toEqual(
        [tx2]
      )

      const byPending = await rpc(app, 'pending')
      expect(
        byPending.result?.map((receipt) => receipt.transactionHash)
      ).toEqual([tx2])

      for (const tag of ['earliest', 'safe', 'finalized']) {
        const response = await rpc(app, tag)
        expect(
          response.result?.map((receipt) => receipt.transactionHash)
        ).toEqual([tx1])
      }

      const byHash = await rpc(app, block1)
      if (!byHash.result) throw new Error('expected receipts by hash')
      expect(byHash.result).toHaveLength(1)
      expect(byHash.result[0]).toMatchObject({
        blockHash: block1,
        blockNumber: '0x1',
        transactionHash: tx1,
        transactionIndex: '0x0',
      })
      expect(byHash.result[0]?.logs).toEqual([
        expect.objectContaining({
          blockHash: block1,
          transactionHash: tx1,
          logIndex: '0x0',
        }),
      ])
    })
  })

  test('returns null for an unknown valid block hash', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)

      const response = await rpc(createReceiptTestApi(db), bytes32('f'))
      expect(response.result).toBeNull()
    })
  })

  test('returns invalid params for malformed block identifiers', async () => {
    await withTestDatabase(async (db) => {
      const response = await rpc(createReceiptTestApi(db), '0xzz')
      expect(response.error).toEqual({
        code: -32602,
        message: 'invalid block parameter',
      })
    })
  })

  test('streams the same result across log batch sizes and HTTP', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      await db.insert(schema.transactions).values(transactionRow(1n, 1, tx3))
      await db
        .insert(schema.logs)
        .values([
          logRow(1n, 1, 0, '2'),
          logRow(1n, 2, 1, '3'),
          logRow(1n, 3, 1, '4'),
        ])

      const batchOne = JSON.parse(await renderPreparedStream(db, '0x1', 1))
      const batchTwo = JSON.parse(await renderPreparedStream(db, block1, 2))
      const app = createReceiptTestApi(db)

      expect(batchTwo.result).toEqual(batchOne.result)
      expect((await rpc(app, '0x1')).result).toEqual(batchOne.result)
      expect(JSON.parse(await renderPreparedStream(db, 'latest', 2))).toEqual(
        await rpc(app, 'latest')
      )
    })
  })

  test('streams singleton HTTP requests and rejects batches', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      const app = createReceiptTestApi(db)

      const response = await app.request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody('0x1'),
      })
      expect(response.status).toBe(200)
      expect(response.headers.get('content-type')).toContain('application/json')
      expect((await response.json()).result).toHaveLength(1)

      const batch = await app.request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify([
          JSON.parse(requestBody('0x1')),
          {
            jsonrpc: '2.0',
            id: 2,
            method: 'eth_chainId',
            params: [],
          },
        ]),
      })
      const batchBody = await batch.json()
      expect(batchBody).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Batch requests are not supported' },
      })
    })
  })

  test('streams null and empty results and returns validation errors without leaking connections', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      await db.insert(schema.blocks).values(blockRow(3n, bytes32('3'), block2))
      const app = createReceiptTestApi(db)
      const idleBefore = db.$client.idleCount

      const unknown = await postBlockReceiptRequest(app, bytes32('f'))
      expect(await unknown.json()).toMatchObject({ result: null })

      const empty = await postBlockReceiptRequest(app, '0x3')
      expect(await empty.json()).toMatchObject({ result: [] })

      const invalid = await postBlockReceiptRequest(app, '0xzz')
      expect(await invalid.json()).toMatchObject({
        error: { code: -32602, message: 'invalid block parameter' },
      })

      expect(db.$client.idleCount).toBe(idleBefore)
    })
  })

  test('streams through gzip compression', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      const response = await createReceiptTestApi(db).request('/', {
        method: 'POST',
        headers: {
          'accept-encoding': 'gzip',
          'content-type': 'application/json',
        },
        body: requestBody('0x1'),
      })

      expect(response.headers.get('content-encoding')).toBe('gzip')
      const decompressed = Bun.gunzipSync(
        new Uint8Array(await response.arrayBuffer())
      )
      expect(
        JSON.parse(new TextDecoder().decode(decompressed)).result
      ).toHaveLength(1)
    })
  })

  test('rolls back and releases its connection when the output aborts', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      await db.update(schema.logs).set({ data: `0x${'ab'.repeat(70_000)}` })

      const streamCapacity = new StreamCapacityLimiter(1)
      const idleBefore = db.$client.idleCount
      const response = await createReceiptTestApi(db, streamCapacity).request(
        '/',
        {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: requestBody('0x1'),
        }
      )
      const reader = response.body?.getReader()
      if (!reader) throw new Error('expected response body')

      expect((await reader.read()).done).toBe(false)
      await reader.cancel()

      for (let attempt = 0; attempt < 50; attempt++) {
        if (db.$client.idleCount === idleBefore) break
        await Bun.sleep(10)
      }

      expect(db.$client.idleCount).toBe(idleBefore)
      expect(streamCapacity.active).toBe(0)
    })
  })
})

async function renderPreparedStream(
  db: Database,
  block: unknown,
  batchSize: number
) {
  const app = new Hono()
  app.get('/', (c) =>
    streamJsonRpc(c, { id: 1 }, (stream) =>
      streamEthGetBlockReceipts(
        {
          config: { finality: 1n },
          db,
          streamCapacity: new StreamCapacityLimiter(1),
        },
        [block],
        stream,
        { batchSize }
      )
    )
  )
  return (await app.request('/')).text()
}

function requestBody(block: unknown) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id: 1,
    method: 'eth_getBlockReceipts',
    params: [block],
  })
}

function postBlockReceiptRequest(
  app: ReturnType<typeof createReceiptTestApi>,
  block: unknown
) {
  return app.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: requestBody(block),
  })
}

async function rpc(
  app: ReturnType<typeof createReceiptTestApi>,
  block: unknown
) {
  return (await (await postBlockReceiptRequest(app, block)).json()) as {
    jsonrpc: '2.0'
    id: number
    result: Array<{
      blockHash: string
      blockNumber: string
      transactionHash: string
      transactionIndex: string
      logs: Array<{
        blockHash: string
        transactionHash: string
        logIndex: string
      }>
    }> | null
    error?: { code: number; message: string }
  }
}
