import { expect, test } from 'bun:test'
import { asc } from 'drizzle-orm'

import type { InternalConfig } from '../src/config.ts'
import { schema } from '../src/db/schema/index.ts'
import { createRpcClients } from '../src/rpc/client.ts'
import { runBackfill } from '../src/sync/backfill.ts'
import type { Logger } from '../src/utils/logger.ts'
import { withTestDatabase } from './helpers.ts'
import { rpcBlock } from './rpc-fixtures.ts'
import { mockUpstreamRpc, type RpcRequest, upstreamRpcUrl } from './upstream.ts'

test('uses concurrency-sized COPY batches and resumes from the database cursor', async () => {
  await withTestDatabase(async (db) => {
    const requests = mockUpstreamRpc({
      eth_blockNumber: '0x5',
      eth_getBlockByNumber: ({ params }: RpcRequest) =>
        rpcBlock(BigInt(String(params?.[0]))),
    })
    const completedBatches: Record<string, unknown>[] = []
    const fetchedBatches: Record<string, unknown>[] = []
    const writtenBatches: Record<string, unknown>[] = []
    const logger = {
      debug(bindings: Record<string, unknown>, message: string) {
        if (message === 'fetched onchain block data') {
          fetchedBatches.push(bindings)
        }
        if (message === 'wrote indexed block data') {
          writtenBatches.push(bindings)
        }
      },
      error: () => undefined,
      warn: () => undefined,
      info(bindings: Record<string, unknown>, message: string) {
        if (message === 'backfill batch completed') {
          completedBatches.push(bindings)
        }
      },
    } as unknown as Logger
    const clients = createRpcClients({ rpcUrl: upstreamRpcUrl })
    const config = {
      startBlock: 1n,
      finality: 0n,
      deferBackfillIndexes: false,
      backfillConcurrency: 2,
      clients,
    } as InternalConfig

    await expect(runBackfill({ db, config, logger })).resolves.toBe(6n)

    expect(completedBatches).toHaveLength(3)
    expect(fetchedBatches).toHaveLength(3)
    expect(writtenBatches).toHaveLength(3)
    expect(completedBatches.map(({ blocks }) => blocks)).toEqual([2, 2, 1])
    expect(fetchedBatches.map(({ blocks }) => blocks)).toEqual([2, 2, 1])
    expect(writtenBatches.map(({ blocks }) => blocks)).toEqual([2, 2, 1])
    expect(
      (
        await db
          .select({ number: schema.blocks.number })
          .from(schema.blocks)
          .orderBy(asc(schema.blocks.number))
      ).map(({ number }) => number)
    ).toEqual([1n, 2n, 3n, 4n, 5n])

    const blockRequestsBeforeResume = requests.filter(
      ({ method }) => method === 'eth_getBlockByNumber'
    ).length
    await expect(runBackfill({ db, config, logger })).resolves.toBe(6n)
    expect(
      requests.filter(({ method }) => method === 'eth_getBlockByNumber')
    ).toHaveLength(blockRequestsBeforeResume)
  })
})
