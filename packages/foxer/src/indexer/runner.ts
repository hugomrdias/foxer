import type { PublicClient } from 'viem'
import { env } from '../config/env.ts'
import type { Database } from '../db/client.ts'
import type { relations, schema } from '../db/schema/index.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import type { InternalConfig } from '../utils/types.ts'
import { runBackfill } from './backfill.ts'
import { startLiveSync } from './live.ts'
import { verifyRecentBlocks } from './reorg.ts'

export async function bootstrapIndexer(options: {
  db: Database<typeof schema, typeof relations>
  client: PublicClient
  registry: HookRegistry
  config: InternalConfig
}): Promise<{ stop: () => void }> {
  await verifyRecentBlocks({
    db: options.db,
    client: options.client,
    depth: env.REORG_CHECK_DEPTH,
  })

  const nextCursor = await runBackfill(options)

  const live = startLiveSync({
    config: options.config,
    db: options.db,
    client: options.client,
    registry: options.registry,
    initialCursor: nextCursor,
  })

  return live
}
