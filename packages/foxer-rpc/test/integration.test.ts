import { expect, test } from 'bun:test'

import { createApiServer } from '../src/api/server.ts'
import { createRpcClients } from '../src/rpc/client.ts'
import { safeGetBlock } from '../src/rpc/get-block.ts'
import { processBlock } from '../src/sync/process-block.ts'
import { testLogger, withTestDatabase } from './helpers.ts'
import { rpcBlock } from './rpc-fixtures.ts'
import { mockUpstreamRpc, upstreamRpcUrl } from './upstream.ts'

test('upstream HTTP block is stored in PostgreSQL and served as JSON-RPC', async () => {
  await withTestDatabase(async (db) => {
    mockUpstreamRpc({ eth_getBlockByNumber: rpcBlock(1n) })
    const clients = createRpcClients({ rpcUrl: upstreamRpcUrl })
    const weighted = await safeGetBlock({
      client: clients.backfill,
      blockNumber: 1n,
      db,
    })

    await expect(
      processBlock({
        logger: testLogger,
        db,
        client: clients.live,
        data: weighted.data,
      })
    ).resolves.toEqual({ status: 'ok' })

    const app = createApiServer({
      db,
      config: {
        chainId: 314_159,
        clients,
        maxConnections: 100,
        maxStreamConnections: 80,
      } as never,
      logger: testLogger,
    })
    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBlockByNumber',
        params: ['0x1', false],
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      result: { number: '0x1', transactions: [] },
    })
  })
})
