import { serve } from '@hono/node-server'
import shutdown from 'http-shutdown'

import type { InternalConfig } from '../config/config.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import { createApiServer } from './server.ts'

export function createApi(options: {
  db: Database
  config: InternalConfig
  logger: Logger
  port: number
}): { stop: () => void } {
  const app = createApiServer({
    logger: options.logger,
    db: options.db,
    config: options.config,
  })

  const server = serve(
    {
      fetch: app.fetch,
      port: options.port,
    },
    () => {
      options.logger.info({ port: options.port }, 'api server listening')
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
