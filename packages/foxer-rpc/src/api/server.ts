import { Hono } from 'hono'
import { bearerAuth } from 'hono/bearer-auth'
import { bodyLimit } from 'hono/body-limit'
import { jwt, sign } from 'hono/jwt'
import { compress } from 'hono-compress'
import { type PinoLogger, pinoLogger } from 'hono-pino'
import { z } from 'zod'

import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import {
  handleJsonRpc,
  handleJsonRpcStream,
  isStreamedRequest,
} from './json-rpc/index.ts'
import { error, isRequest } from './json-rpc/response.ts'
import { streamJsonRpc } from './json-rpc/stream.ts'

const mintKeySchema = z.object({
  sub: z.string().min(1),
  expiresInDays: z.coerce.number().int().positive().optional(),
})

export const JSON_RPC_MAX_REQUEST_BODY_SIZE = 1024 * 1024

function omitJsonRpcEnvelope(value: unknown): unknown {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return value
  }

  const copy: Record<string, unknown> = { ...value }
  delete copy.jsonrpc
  delete copy.id
  return copy
}

/**
 * Builds the Hono app used by the CLI server.
 *
 * The app installs request logging, response compression, a lightweight health
 * route, and the JSON-RPC POST endpoint. Known methods are served from the
 * local database; selected read-only methods are proxied by `handleJsonRpc`.
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

  app.post(
    '/',
    bodyLimit({
      maxSize: JSON_RPC_MAX_REQUEST_BODY_SIZE,
      onError: (c) =>
        c.json(error(null, -32600, 'Request body too large'), 413),
    }),
    async (c) => {
      const contentType = c.req.header('content-type')
      if (
        contentType?.split(';', 1)[0]?.trim().toLowerCase() !==
        'application/json'
      ) {
        return c.json(
          error(null, -32600, 'Content-Type must be application/json'),
          415
        )
      }

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

      if (Array.isArray(body)) {
        return c.json(error(null, -32600, 'Batch requests are not supported'))
      }
      if (!isRequest(body)) {
        return c.json(error(null, -32600, 'Invalid Request'))
      }

      const id = body.id ?? null
      if (!Object.hasOwn(body, 'id')) {
        return c.json(error(null, -32600, 'Invalid Request'))
      }

      c.var.logger.assign({ jsonRpcBody: omitJsonRpcEnvelope(body) })

      if (isStreamedRequest(body)) {
        return streamJsonRpc(c, { id }, (stream) =>
          handleJsonRpcStream({ db, config, logger, body, stream })
        )
      }

      const result = await handleJsonRpc({ db, config, logger, body })
      return c.json(result)
    }
  )

  return app
}
