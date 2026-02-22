import { gracefulExit } from 'exit-hook'
import { runApiServer } from './api/runner'
import { createDatabase } from './db/client'
import { runMigrations } from './db/migrate'
import { runIndexer } from './indexer/runner'
import { createComponentLogger } from './logger'
import { createExit } from './utils/shutdown'

const log = createComponentLogger('main')

/**
 * Boots the full application (migrations, API, and indexer) in one process.
 */
async function main(): Promise<{ stop: () => Promise<void> }> {
  const dbContext = createDatabase()
  await runMigrations({ dbContext })
  const [api, indexer] = await Promise.all([
    runApiServer({ dbContext }),
    runIndexer({ dbContext }),
  ])

  return {
    stop: async () => {
      await Promise.all([api.stop(), indexer.stop()])
      await dbContext.close()
    },
  }
}

main()
  .then(({ stop }) => {
    createExit({
      logger: log,
      stop,
    })
  })
  .catch((error) => {
    log.error({ err: error }, 'application bootstrap failed')
    gracefulExit(1)
  })
