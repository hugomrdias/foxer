import type { InternalConfig } from '../config/config.ts'
import type { Env } from '../config/env.ts'
import type { Database } from '../db/client.ts'
import type { relations, schema } from '../db/schema/index.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import type { Logger } from '../utils/logger.ts'
import { runBackfill } from './backfill.ts'
import { startLiveSync } from './live.ts'
import { verifyRecentBlocks } from './reorg.ts'

export async function bootstrapIndexer(options: {
  env: Env
  logger: Logger
  db: Database<typeof schema, typeof relations>
  registry: HookRegistry
  config: InternalConfig
}): Promise<{ stop: () => void }> {
  await verifyRecentBlocks({
    logger: options.logger,
    db: options.db,
    client: options.config.clients.live,
    depth: options.env.CONFIRMATION_DEPTH,
  })

  const nextCursor = await runBackfill(options)

  const live = startLiveSync({
    logger: options.logger,
    config: options.config,
    db: options.db,
    client: options.config.clients.live,
    registry: options.registry,
    initialCursor: nextCursor,
  })

  return live
}
