import { Hono } from 'hono'
import { type PinoLogger, pinoLogger } from 'hono-pino'
import type { InternalConfig } from '../config/config.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'

/**
 * Builds the Hono API server with health and sql endpoints.
 */
export function createApiServer({
  db,
  config,
  logger,
}: {
  db: Database
  config: InternalConfig
  logger: Logger
}) {
  const app = new Hono<{ Variables: { logger: PinoLogger } }>()

  app.use(
    pinoLogger({
      pino: logger,
    })
  )

  app.get('/health', async (c) => {
    const latest =
      (await db.$prepared.getLatestBlock.execute())[0]?.number ?? null
    return c.json({
      ok: true,
      latestIndexedBlock: latest?.toString() ?? null,
    })
  })

  app.route('/', config.hono({ logger, db }))
  return app
}
