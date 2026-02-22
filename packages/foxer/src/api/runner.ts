import { serve } from '@hono/node-server'
import shutdown from 'http-shutdown'
import { env } from '../config/env.ts'
import type { Database } from '../db/client.ts'
import { createComponentLogger } from '../logger.ts'
import type { InternalConfig } from '../utils/types.ts'
import { createApiServer } from './server.ts'

const log = createComponentLogger('api')

export function bootstrapApiServer(options: {
  db: Database
  config: InternalConfig
}): { stop: () => void } {
  const app = createApiServer({
    db: options.db,
    config: options.config,
  })

  const server = serve(
    {
      fetch: app.fetch,
      port: env.API_PORT,
    },
    () => {
      log.info({ port: env.API_PORT }, 'api server listening')
    }
  )

  const _server = shutdown(server)

  return {
    stop: () => {
      _server.shutdown((err) => {
        if (err) {
          log.error({ err }, 'api server shutdown failed')
          return
        }
        log.info('api server shutdown complete')
      })
    },
  }
}
