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

test('writes oversized blocks as bounded standalone batches and resumes from the database cursor', async () => {
  await withTestDatabase(async (db) => {
    const requests = mockUpstreamRpc({
      eth_blockNumber: '0x3',
      eth_getBlockByNumber: ({ params }: RpcRequest) =>
        rpcBlock(BigInt(String(params?.[0]))),
    })
    const completedBatches: Record<string, unknown>[] = []
    const fetchedBatches: Record<string, unknown>[] = []
    const writtenBatches: Record<string, unknown>[] = []
    const completedRuns: Record<string, unknown>[] = []
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
        if (message === 'backfill completed') {
          completedRuns.push(bindings)
        }
      },
    } as unknown as Logger
    const clients = createRpcClients({ rpcUrl: upstreamRpcUrl })
    const config = {
      startBlock: 1n,
      finality: 0n,
      deferBackfillIndexes: false,
      backfillMemoryLimitBytes: 1,
      clients,
    } as InternalConfig

    await expect(runBackfill({ db, config, logger })).resolves.toBe(4n)

    expect(completedBatches).toHaveLength(3)
    expect(fetchedBatches).toHaveLength(3)
    expect(writtenBatches).toHaveLength(3)
    for (const fetched of fetchedBatches) {
      expect(fetched.rssBeforeCopy).toBeNumber()
      expect(fetched.heapUsedBeforeCopy).toBeNumber()
      expect(fetched.externalBeforeCopy).toBeNumber()
      expect(fetched.arrayBuffersBeforeCopy).toBeNumber()
      expect(fetched.peakObservedRss).toBeNumber()
    }
    for (const written of writtenBatches) {
      expect(written).not.toHaveProperty('rss')
      expect(written).not.toHaveProperty('heapUsed')
      expect(written).not.toHaveProperty('external')
    }
    expect(completedRuns).toHaveLength(1)
    expect(completedRuns[0].peakObservedRss).toBeNumber()
    expect(
      completedBatches.map(({ blocks, oversizedBlock }) => ({
        blocks,
        oversizedBlock,
      }))
    ).toEqual([
      { blocks: 1, oversizedBlock: true },
      { blocks: 1, oversizedBlock: true },
      { blocks: 1, oversizedBlock: true },
    ])
    expect(
      (
        await db
          .select({ number: schema.blocks.number })
          .from(schema.blocks)
          .orderBy(asc(schema.blocks.number))
      ).map(({ number }) => number)
    ).toEqual([1n, 2n, 3n])

    const blockRequestsBeforeResume = requests.filter(
      ({ method }) => method === 'eth_getBlockByNumber'
    ).length
    await expect(runBackfill({ db, config, logger })).resolves.toBe(4n)
    expect(
      requests.filter(({ method }) => method === 'eth_getBlockByNumber')
    ).toHaveLength(blockRequestsBeforeResume)
  })
})
