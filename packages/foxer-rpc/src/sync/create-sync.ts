import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import { runBackfill } from './backfill.ts'
import { startLiveSync } from './live.ts'
import { verifyRecentBlocks } from './reorg.ts'

/**
 * Starts the complete sync lifecycle.
 *
 * Startup first validates recent persisted blocks for reorgs, then performs a
 * historical backfill up to the safe head, and finally follows new heads with a
 * sequential live queue. The returned `stop` function stops live watching.
 */
export async function createSync(options: {
  logger: Logger
  db: Database
  config: InternalConfig
}): Promise<{ stop: () => void }> {
  await verifyRecentBlocks({
    logger: options.logger,
    db: options.db,
    client: options.config.clients.backfill,
    depth: options.config.finality,
  })

  const nextCursor = await runBackfill(options)

  return startLiveSync({
    logger: options.logger,
    config: options.config,
    db: options.db,
    client: options.config.clients.live,
    initialCursor: nextCursor,
  })
}
