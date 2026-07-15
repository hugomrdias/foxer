import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import { createApiServer } from './server.ts'

/**
 * Starts the Bun HTTP server for the JSON-RPC API.
 *
 * The returned `stop` function allows in-flight requests to finish during
 * process exit before Bun closes the listener.
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

  const server = Bun.serve({
    fetch: app.fetch,
    port: options.port,
  })

  options.logger.info(
    { port: server.port ?? options.port },
    'json-rpc server listening'
  )

  return {
    stop: async () => {
      try {
        await server.stop(false)
      } catch (error) {
        options.logger.error({ error }, 'api server shutdown failed')
        throw error
      }
      options.logger.info('api server shutdown complete')
    },
  }
}
