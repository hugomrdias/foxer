import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'
import type { Hash } from 'viem'
import { streamEthGetBlockReceipts } from '../src/api/json-rpc/methods/eth-get-block-receipts-stream.ts'
import { streamJsonRpc } from '../src/api/json-rpc/stream.ts'
import { createApiServer } from '../src/api/server.ts'
import { type Database, receiptTransactionColumns } from '../src/db/client.ts'
import { schema } from '../src/db/schema/index.ts'
import type { EncodedBlock, EncodedTransaction } from '../src/types.ts'
import { hexToBytes } from '../src/utils/hex.ts'
import {
  address,
  bytes32,
  emptyRoot,
  testLogger,
  withTestDatabase,
  zeroLogsBloom,
} from './helpers.ts'

const block1 = bytes32('1')
const block2 = bytes32('2')
const tx1 = bytes32('a')
const tx2 = bytes32('b')
const tx3 = bytes32('e')

describe('eth_getBlockReceipts', () => {
  test('receipt queries omit transaction calldata and unrelated columns', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)

      const [byHash] = await db.$prepared.getReceiptTransactionByHash.execute({
        hash: hexToBytes(tx1),
      })
      const expectedColumns = [
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
      ]

      expect(Object.keys(byHash).sort()).toEqual(expectedColumns)
      expect(Object.keys(receiptTransactionColumns).sort()).toEqual(
        expectedColumns
      )
      expect(byHash).not.toHaveProperty('input')
    })
  })

  test('resolves block numbers, tags, and hashes', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      const app = createTestApi(db)

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

      const response = await rpc(createTestApi(db), bytes32('f'))
      expect(response.result).toBeNull()
    })
  })

  test('returns invalid params for malformed block identifiers', async () => {
    await withTestDatabase(async (db) => {
      const response = await rpc(createTestApi(db), '0xzz')
      expect(response.error).toEqual({
        code: -32602,
        message: 'invalid block parameter',
      })
    })
  })

  test('streams the same result across log batch sizes and HTTP', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      await db.insert(schema.transactions).values(txRow(1n, 1, tx3))
      await db
        .insert(schema.logs)
        .values([
          logRow(1n, 1, 0, '2'),
          logRow(1n, 2, 1, '3'),
          logRow(1n, 3, 1, '4'),
        ])

      const batchOne = JSON.parse(await renderPreparedStream(db, '0x1', 1))
      const batchTwo = JSON.parse(await renderPreparedStream(db, block1, 2))
      const app = createTestApi(db)

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
      const app = createTestApi(db)

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
      const app = createTestApi(db)
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
      const response = await createTestApi(db).request('/', {
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

      const idleBefore = db.$client.idleCount
      const response = await createTestApi(db).request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: requestBody('0x1'),
      })
      const reader = response.body?.getReader()
      if (!reader) throw new Error('expected response body')

      expect((await reader.read()).done).toBe(false)
      await reader.cancel()

      for (let attempt = 0; attempt < 50; attempt++) {
        if (db.$client.idleCount === idleBefore) break
        await Bun.sleep(10)
      }

      expect(db.$client.idleCount).toBe(idleBefore)
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
      streamEthGetBlockReceipts({ db }, [block], stream, { batchSize })
    )
  )
  return (await app.request('/')).text()
}

function createTestApi(db: Database) {
  return createApiServer({
    db,
    logger: testLogger,
    config: {
      chainId: 314_159,
      clients: {
        backfill: {
          request: () => {
            throw new Error('unexpected proxy request')
          },
        },
        live: {
          request: () => {
            throw new Error('unexpected proxy request')
          },
        },
      },
    } as never,
  })
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
  app: ReturnType<typeof createTestApi>,
  block: unknown
) {
  return app.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: requestBody(block),
  })
}

async function rpc(app: ReturnType<typeof createTestApi>, block: unknown) {
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

async function seedReceipts(db: Database) {
  await db
    .insert(schema.blocks)
    .values([blockRow(1n, block1, bytes32('0')), blockRow(2n, block2, block1)])
  await db
    .insert(schema.transactions)
    .values([txRow(1n, 0, tx1), txRow(2n, 0, tx2)])
  await db.insert(schema.logs).values([logRow(1n, 0, 0, '1')])
}

function logRow(
  blockNumber: bigint,
  logIndex: number,
  transactionIndex: number,
  marker: string
) {
  return {
    blockNumber,
    logIndex,
    transactionIndex,
    address: address(marker),
    topic0: bytes32(marker),
    topic1: null,
    topic2: null,
    topic3: null,
    data: '0x' as const,
  }
}

function blockRow(number: bigint, hash: Hash, parentHash: Hash): EncodedBlock {
  return {
    number,
    hash,
    isNullRound: false,
    parentHash,
    timestamp: number,
    miner: address('0'),
    gasUsed: 21_000n,
    gasLimit: 30_000_000n,
    baseFeePerGas: 1_000_000_000n,
    size: 1n,
    stateRoot: emptyRoot,
    receiptsRoot: emptyRoot,
    transactionsRoot: emptyRoot,
    extraData: '0x',
    logsBloom: zeroLogsBloom,
  }
}

function txRow(
  blockNumber: bigint,
  transactionIndex: number,
  hash: Hash
): EncodedTransaction {
  return {
    hash,
    blockNumber,
    transactionIndex,
    from: address('a'),
    to: address('b'),
    input: '0x',
    value: 0n,
    nonce: transactionIndex,
    gas: 21_000n,
    gasPrice: 1n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    type: 2,
    v: 1n,
    r: bytes32('c'),
    s: bytes32('d'),
    accessList: null,
    status: 1,
    receiptGasUsed: 21_000n,
    cumulativeGasUsed: 21_000n,
    effectiveGasPrice: 1n,
    contractAddress: null,
    logsBloom: zeroLogsBloom,
  }
}
