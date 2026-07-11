import { expect, test } from 'bun:test'

import { schema } from '../src/db/schema/index.ts'
import { createRpcClients } from '../src/rpc/client.ts'
import { startLiveSync } from '../src/sync/live.ts'
import { testLogger, withTestDatabase } from './helpers.ts'
import { rpcBlock } from './rpc-fixtures.ts'
import {
  mockUpstreamRpc,
  type RpcRequest,
  realtimeRpcUrl,
  upstreamRpcUrl,
} from './upstream.ts'

test('stop clears queued HTTP blocks and waits for active database work', async () => {
  await withTestDatabase(async (db) => {
    let releaseBlock: () => void = () => undefined
    const blockGate = new Promise<void>((resolve) => {
      releaseBlock = resolve
    })
    let markBlockStarted: () => void = () => undefined
    const blockStarted = new Promise<void>((resolve) => {
      markBlockStarted = resolve
    })

    mockUpstreamRpc(
      {
        eth_blockNumber: '0x2',
        eth_getBlockByNumber: async ({ params }: RpcRequest) => {
          const blockNumber = BigInt(String(params?.[0]))
          if (blockNumber === 1n) {
            markBlockStarted()
            await blockGate
          }
          return rpcBlock(blockNumber)
        },
      },
      { url: realtimeRpcUrl }
    )
    const clients = createRpcClients({
      rpcUrl: upstreamRpcUrl,
      realtimeRpcUrl,
    })
    const sync = startLiveSync({
      logger: testLogger,
      config: { clients } as never,
      db,
      client: clients.live,
      initialCursor: 1n,
    })

    await blockStarted
    let stopped = false
    const stop = sync.stop().then(() => {
      stopped = true
    })
    await Promise.resolve()
    expect(stopped).toBe(false)

    releaseBlock()
    await stop
    expect(stopped).toBe(true)
    expect(
      (await db.select().from(schema.blocks)).map(({ number }) => number)
    ).toEqual([1n])

    await sync.stop()
  })
})
