import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { jwt, sign } from 'hono/jwt'
import { compress } from 'hono-compress'
import { type PinoLogger, pinoLogger } from 'hono-pino'
import { z } from 'zod'

import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import { handleJsonRpc } from './json-rpc.ts'

const mintKeySchema = z.object({
  sub: z.string().min(1),
  expiresInDays: z.coerce.number().int().positive().optional(),
})

/**
 * Builds the Hono app used by the CLI server.
 *
 * The app installs request logging, response compression, a lightweight health
 * route, and the JSON-RPC POST endpoint. Known methods are served from the
 * local database; unsupported methods are proxied by `handleJsonRpc`.
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

  if (config.authSecret) {
    const authSecret = config.authSecret
    const requireJwt = jwt({ secret: authSecret, alg: 'HS256' })
    const isAuthExempt = (path: string) =>
      path === '/health' || path === '/admin/keys'
    const queryTokenToBearer = async (
      c: Parameters<typeof requireJwt>[0],
      next: Parameters<typeof requireJwt>[1]
    ) => {
      const queryToken = c.req.query('token')
      if (!c.req.header('Authorization') && queryToken) {
        const headers = new Headers(c.req.raw.headers)
        headers.set('Authorization', `Bearer ${queryToken}`)
        const url = new URL(c.req.url)
        url.searchParams.delete('token')
        c.req.raw = new Request(url, {
          headers,
          method: c.req.raw.method,
          body: c.req.raw.body,
        })
      }
      await next()
    }
    app.use('*', (c, next) => {
      if (isAuthExempt(c.req.path)) {
        return next()
      }
      return queryTokenToBearer(c, next)
    })
    app.use('*', (c, next) => {
      if (isAuthExempt(c.req.path)) {
        return next()
      }
      return requireJwt(c, next)
    })

    app.post('/admin/keys', bearerAuth({ token: authSecret }), async (c) => {
      let body: unknown
      try {
        body = await c.req.json()
      } catch {
        return c.json({ error: 'Invalid JSON body' }, 400)
      }

      const parsed = mintKeySchema.safeParse(body)
      if (!parsed.success) {
        return c.json({ error: parsed.error.message }, 400)
      }

      const { sub, expiresInDays } = parsed.data
      const now = Math.floor(Date.now() / 1000)
      const token = await sign(
        {
          sub,
          iat: now,
          ...(expiresInDays && { exp: now + expiresInDays * 86_400 }),
        },
        authSecret
      )

      return c.json({ token, sub })
    })
  }

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
    return c.json(result)
  })

  return app
}
