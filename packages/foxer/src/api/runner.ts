import { serve } from '@hono/node-server'
import shutdown from 'http-shutdown'
import type { InternalConfig } from '../config/config.ts'
import type { Env } from '../config/env.ts'
import { createPublication, type Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import { createApiServer } from './server.ts'

export async function bootstrapApiServer(options: {
  env: Env
  db: Database
  config: InternalConfig
  logger: Logger
}): Promise<{ stop: () => void }> {
  // create publication for all tables
  // this is needed for the live sync to work
  // TODO create publication only for tables that are used in the api
  // check wal is enabled
  // const result = await options.db.execute('SELECT * FROM pg_stat_replication')
  // if (result.rows.length === 0) {
  //   throw new Error('WAL is not enabled')
  // }
  await createPublication(options.db)

  const app = createApiServer({
    env: options.env,
    logger: options.logger,
    db: options.db,
    config: options.config,
  })

  const server = serve(
    {
      fetch: app.fetch,
      port: options.env.PORT,
    },
    () => {
      options.logger.info({ port: options.env.PORT }, 'api server listening')
    }
  )

  const _server = shutdown(server)

  return {
    stop: () => {
      _server.shutdown((error) => {
        if (error) {
          options.logger.error({ error }, 'api server shutdown failed')
          return
        }
        options.logger.info('api server shutdown complete')
      })
    },
  }
}
