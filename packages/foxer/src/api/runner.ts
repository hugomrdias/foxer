import { serve } from '@hono/node-server'
import { gracefulExit } from 'exit-hook'
import { config } from '../config'
import { env } from '../config/env'
import { createDatabase, type DatabaseContext } from '../db/client'
import { runMigrations } from '../db/migrate'
import { createComponentLogger } from '../logger'
import { createExit } from '../utils/shutdown'
import { createApiServer } from './server'

const log = createComponentLogger('api')

/**
 * Starts the HTTP API server and optionally manages process signal handlers.
 */
export async function runApiServer(options?: {
  dbContext?: DatabaseContext
}): Promise<{ stop: () => Promise<void> }> {
  const dbContext = options?.dbContext ?? createDatabase()
  const ownDb = !options?.dbContext
  if (ownDb) {
    await runMigrations({ dbContext })
  }
  const app = createApiServer({
    db: dbContext.db,
    config: config as never,
  })

  const server = serve({
    fetch: app.fetch,
    port: env.API_PORT,
  })

  log.info({ port: env.API_PORT }, 'api server listening')

  return {
    stop: async () => {
      server.close()
      if (ownDb) {
        await dbContext.close()
      }
    },
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runApiServer()
    .then(({ stop }) => {
      createExit({
        logger: log,
        stop,
      })
    })
    .catch((error) => {
      log.error({ err: error }, 'api runner failed')
      gracefulExit(1)
    })
}
