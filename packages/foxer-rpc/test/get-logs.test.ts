import { describe, expect, test } from 'bun:test'
import { Hono } from 'hono'

import { streamEthGetLogs } from '../src/api/json-rpc/methods/eth-get-logs-stream.ts'
import { streamJsonRpc } from '../src/api/json-rpc/stream.ts'
import { StreamCapacityLimiter } from '../src/api/json-rpc/stream-capacity.ts'
import { createApiServer } from '../src/api/server.ts'
import type { Database } from '../src/db/client.ts'
import { schema } from '../src/db/schema/index.ts'
import {
  address1,
  address2,
  block1,
  seedLogs,
  topic1,
  topic2,
  topic3,
  tx1,
} from './fixtures/logs.ts'
import { bytes32, testLogger, withTestDatabase } from './helpers.ts'

describe('eth_getLogs', () => {
  test('applies address, topic, and block hash filters', async () => {
    await withTestDatabase(async (db) => {
      await seedLogs(db)
      const app = createTestApi(db)

      const byAddress = await getLogs(app, {
        fromBlock: '0x1',
        toBlock: '0x2',
        address: address1,
      })
      expect(byAddress.map((log) => log.logIndex)).toEqual(['0x0', '0x0'])

      const byAddressOr = await getLogs(app, {
        fromBlock: '0x1',
        toBlock: '0x2',
        address: [address2],
      })
      expect(byAddressOr).toEqual([
        {
          address: address2,
          topics: [topic1, topic2],
          data: '0x1234',
          blockNumber: '0x1',
          transactionHash: tx1,
          transactionIndex: '0x0',
          blockHash: block1,
          logIndex: '0x1',
          removed: false,
        },
      ])

      expect(
        await getLogs(app, {
          fromBlock: '0x1',
          toBlock: '0x2',
          address: [],
        })
      ).toEqual([])

      const byTopicWildcard = await getLogs(app, {
        fromBlock: '0x1',
        toBlock: '0x2',
        topics: [null, topic2],
      })
      expect(byTopicWildcard.map((log) => log.logIndex)).toEqual(['0x1'])

      const byTopicOr = await getLogs(app, {
        fromBlock: '0x1',
        toBlock: '0x2',
        topics: [[topic1, topic3]],
      })
      expect(byTopicOr).toHaveLength(3)

      const byBlockHash = await getLogs(app, { blockHash: block1 })
      expect(byBlockHash.map((log) => log.blockHash)).toEqual([block1, block1])
      expect(await getLogs(app, { blockHash: bytes32('f') })).toEqual([])
    })
  })

  test('streams the same ordered result across batches and HTTP', async () => {
    await withTestDatabase(async (db) => {
      await seedLogs(db)
      const filter = { fromBlock: '0x1', toBlock: '0x2' }
      const direct = JSON.parse(await renderStream(db, filter, 1))
      const response = await postRequest(createTestApi(db), filter)

      expect(response.headers.get('content-type')).toContain('application/json')
      expect(await response.json()).toEqual(direct)
      expect(
        direct.result.map((log: { blockNumber: string }) => log.blockNumber)
      ).toEqual(['0x1', '0x1', '0x2'])
    })
  })

  test('returns filter and block-range errors before streaming', async () => {
    await withTestDatabase(async (db) => {
      await seedLogs(db)

      const conflict = await postRequest(createTestApi(db), {
        blockHash: block1,
        fromBlock: '0x1',
      })
      expect(await conflict.json()).toMatchObject({ error: { code: -32602 } })

      const range = await postRequest(createTestApi(db, 0n), {
        fromBlock: '0x1',
        toBlock: '0x2',
      })
      expect(await range.json()).toMatchObject({
        error: {
          code: -32005,
          data: { maxBlockRange: '0' },
          message: 'eth_getLogs block range too large',
        },
      })
    })
  })

  test('rolls back and releases its connection when output aborts', async () => {
    await withTestDatabase(async (db) => {
      await seedLogs(db)
      await db.update(schema.logs).set({ data: `0x${'ab'.repeat(70_000)}` })

      const idleBefore = db.$client.idleCount
      const response = await postRequest(createTestApi(db), {
        fromBlock: '0x1',
        toBlock: '0x2',
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

async function renderStream(
  db: Database,
  filter: Record<string, unknown>,
  batchSize: number
) {
  const app = new Hono()
  app.get('/', (c) =>
    streamJsonRpc(c, { id: 1 }, (stream) =>
      streamEthGetLogs(
        {
          config: createConfig(10n),
          db,
          streamCapacity: new StreamCapacityLimiter(1),
        },
        [filter],
        stream,
        { batchSize }
      )
    )
  )
  return (await app.request('/')).text()
}

function createTestApi(db: Database, maxLogsBlockRange = 10n) {
  return createApiServer({
    db,
    logger: testLogger,
    config: createConfig(maxLogsBlockRange),
  })
}

function createConfig(maxLogsBlockRange: bigint) {
  return {
    chainId: 314_159,
    finality: 1n,
    maxConnections: 100,
    maxLogsBlockRange,
    maxStreamConnections: 80,
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
  } as never
}

function postRequest(
  app: ReturnType<typeof createTestApi>,
  filter: Record<string, unknown>
) {
  return app.request('/', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getLogs',
      params: [filter],
    }),
  })
}

async function getLogs(
  app: ReturnType<typeof createTestApi>,
  filter: Record<string, unknown>
) {
  const response = (await (await postRequest(app, filter)).json()) as {
    result?: Array<{
      address: string
      topics: string[]
      data: string
      blockNumber: string
      transactionHash: string
      transactionIndex: string
      blockHash: string
      logIndex: string
      removed: boolean
    }>
    error?: { message: string }
  }
  if (response.error) throw new Error(response.error.message)
  return response.result ?? []
}
