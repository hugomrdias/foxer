import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'

import { streamEthGetTransactionReceipt } from '../src/api/json-rpc/methods/eth-get-transaction-receipt-stream.ts'
import { streamJsonRpc } from '../src/api/json-rpc/stream.ts'
import { StreamCapacityLimiter } from '../src/api/json-rpc/stream-capacity.ts'
import type { Database } from '../src/db/client.ts'
import { schema } from '../src/db/schema/index.ts'
import {
  block1,
  createReceiptTestApi,
  logRow,
  seedReceipts,
  tx1,
} from './fixtures/receipts.ts'
import { bytes32, withTestDatabase } from './helpers.ts'

describe('eth_getTransactionReceipt', () => {
  test('streams one receipt across log batches and HTTP', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      await db
        .insert(schema.logs)
        .values([logRow(1n, 1, 0, '2'), logRow(1n, 2, 0, '3')])

      const direct = JSON.parse(await renderStream(db, tx1, 1))
      const response = await postRequest(createReceiptTestApi(db), tx1)

      expect(response.headers.get('content-type')).toContain('application/json')
      expect(await response.json()).toEqual(direct)
      expect(direct.result).toMatchObject({
        blockHash: block1,
        blockNumber: '0x1',
        transactionHash: tx1,
        transactionIndex: '0x0',
      })
      expect(
        direct.result.logs.map((log: { logIndex: string }) => log.logIndex)
      ).toEqual(['0x0', '0x1', '0x2'])
    })
  })

  test('streams null and validation errors without leaking connections', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      const app = createReceiptTestApi(db)
      const idleBefore = db.$client.idleCount

      const unknown = await postRequest(app, bytes32('f'))
      expect(await unknown.json()).toMatchObject({ result: null })

      const invalid = await postRequest(app, '0xzz')
      expect(await invalid.json()).toMatchObject({
        error: { code: -32602, message: 'invalid transaction hash' },
      })

      expect(db.$client.idleCount).toBe(idleBefore)
    })
  })

  test('rolls back and releases its connection when output aborts', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)
      await db.update(schema.logs).set({ data: `0x${'ab'.repeat(70_000)}` })

      const idleBefore = db.$client.idleCount
      const response = await postRequest(createReceiptTestApi(db), tx1)
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

async function renderStream(db: Database, hash: unknown, batchSize: number) {
  const app = new Hono()
  app.get('/', (c) =>
    streamJsonRpc(c, { id: 1 }, (stream) =>
      streamEthGetTransactionReceipt(
        { db, streamCapacity: new StreamCapacityLimiter(1) },
        [hash],
        stream,
        { batchSize }
      )
    )
  )
  return (await app.request('/')).text()
}

function postRequest(
  app: ReturnType<typeof createReceiptTestApi>,
  hash: unknown
) {
  return app.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getTransactionReceipt',
      params: [hash],
    }),
  })
}
