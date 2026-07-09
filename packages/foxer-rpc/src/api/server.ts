import { Hono } from 'hono'
import { compress } from 'hono-compress'
import { type PinoLogger, pinoLogger } from 'hono-pino'

import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import { handleJsonRpc } from './json-rpc.ts'

/**
 * Builds the Hono app used by the CLI server.
 *
 * The app installs request logging, response compression, a lightweight health
 * route, and the JSON-RPC POST endpoint. All JSON-RPC methods are served by the
 * local database through `handleJsonRpc`.
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
  app.use(
    compress({
      encodings: ['zstd', 'gzip', 'deflate'],
      threshold: 1024,
      zstdLevel: 3,
      gzipLevel: 6,
    })
  )

  app.get('/health', async (c) => {
    const latest =
      (await db.$prepared.getLatestBlock.execute())[0]?.number ?? null
    return c.json({
      ok: true,
      chainId: config.chainId,
      latestIndexedBlock: latest?.toString() ?? null,
    })
  })

  app.post('/', async (c) => {
    let body: unknown
    try {
      body = await c.req.json()
    } catch (cause) {
      logger.error({ error: cause }, 'json-rpc parse error')
      return c.json(
        {
          jsonrpc: '2.0',
          id: null,
          error: { code: -32700, message: 'Parse error' },
        },
        400
      )
    }

    const result = await handleJsonRpc({ db, config, logger, body })
    if (result === undefined) {
      return c.body(null, 204)
    }
    return c.json(result)
  })

  return app
}
