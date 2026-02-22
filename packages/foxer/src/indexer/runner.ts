import { gracefulExit } from 'exit-hook'
import { config } from '../config'
import { env } from '../config/env'
import { createDatabase, type DatabaseContext } from '../db/client'
import { runMigrations } from '../db/migrate'
import { HookRegistry } from '../hooks/registry'
import { createComponentLogger } from '../logger'
import { createRpcClient } from '../rpc/client'
import { createExit } from '../utils/shutdown'
import { runBackfill } from './backfill'
import { startLiveSync } from './live'
import { verifyRecentBlocks } from './reorg'

const log = createComponentLogger('indexer')

/**
 * Starts the indexer lifecycle: migrate, verify recent blocks, backfill, then live sync.
 */
export async function runIndexer(options?: {
  dbContext?: DatabaseContext
}): Promise<{ stop: () => Promise<void> }> {
  const dbContext = options?.dbContext ?? createDatabase()
  const client = createRpcClient()
  const ownDb = !options?.dbContext
  if (ownDb) {
    await runMigrations({ dbContext })
  }
  const hooks = new HookRegistry()

  await verifyRecentBlocks({
    db: dbContext.db,
    client,
    depth: env.REORG_CHECK_DEPTH,
  })

  const nextCursor = await runBackfill({
    config: config as never,
    db: dbContext.db,
    client,
    hooks,
  })

  const live = startLiveSync({
    config: config as never,
    db: dbContext.db,
    client,
    hooks,
    initialCursor: nextCursor,
  })

  return {
    stop: async () => {
      live.stop()
      if (ownDb) {
        await dbContext.close()
      }
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIndexer()
    .then((indexer) => {
      createExit({
        logger: log,
        stop: indexer.stop,
      })
    })
    .catch((error) => {
      log.error({ err: error }, 'indexer runner failed')
      gracefulExit(1)
    })
}
