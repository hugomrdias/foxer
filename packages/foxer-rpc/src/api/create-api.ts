import { serve } from '@hono/node-server'
import shutdown from 'http-shutdown'

import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import { createApiServer } from './server.ts'

/**
 * Starts the Node HTTP server for the JSON-RPC API.
 *
 * The returned `stop` function performs graceful shutdown through
 * `http-shutdown`, allowing in-flight requests to finish during process exit.
 */
export function createApi(options: {
  db: Database
  config: InternalConfig
  logger: Logger
  port: number
}): { stop: () => Promise<void> } {
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
      options.logger.info({ port: options.port }, 'json-rpc server listening')
    }
  )

  const serverWithShutdown = shutdown(server)

  return {
    stop: () =>
      new Promise<void>((resolve, reject) => {
        serverWithShutdown.shutdown((error) => {
          if (error) {
            options.logger.error({ error }, 'api server shutdown failed')
            reject(error)
            return
          }
          options.logger.info('api server shutdown complete')
          resolve()
        })
      }),
  }
}
