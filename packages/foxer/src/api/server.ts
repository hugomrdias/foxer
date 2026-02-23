import type { QueryWithTypings } from 'drizzle-orm'
import { Hono } from 'hono'
import { streamSSE } from 'hono/streaming'
import { type PinoLogger, pinoLogger } from 'hono-pino'
import postgres from 'postgres'
import { env } from '../config/env.ts'
import type { Database } from '../db/client.ts'
import { getBlockByIdOrLatest } from '../indexer/state.ts'
import { createComponentLogger } from '../logger.ts'
import { noop } from '../utils/common.ts'
import type { InternalConfig } from '../utils/types.ts'
import { executeSql, validateSql } from './sql.ts'
import { sseError } from './sse.ts'

const log = createComponentLogger('api')

/**
 * Builds the Hono API server with health and sql endpoints.
 */
export function createApiServer({
  db,
  config,
}: {
  db: Database
  config: InternalConfig
}) {
  const app = new Hono<{ Variables: { logger: PinoLogger } }>()

  app.use(
    pinoLogger({
      pino: log,
    })
  )

  app.get('/health', async (c) => {
    const latest = (await getBlockByIdOrLatest({ db }))?.blockNumber ?? null
    return c.json({
      ok: true,
      latestIndexedBlock: latest?.toString() ?? null,
    })
  })

  app.get('/sql/live', async (c) => {
    const queryString = c.req.query('sql')
    if (!queryString) {
      return sseError(c, 'sql query is required')
    }
    const query = JSON.parse(queryString) as QueryWithTypings

    const result = await validateSql(query)
    if (result.error) {
      return sseError(c, result.error.message)
    }

    const tables = result.result

    const dbResult = await executeSql({ db, query })

    if (dbResult.error) {
      return sseError(c, dbResult.error.message)
    }

    let closeSubscription: () => void = noop
    const pg = postgres(env.DATABASE_URL!, {
      publications: 'alltables',
    })

    return streamSSE(
      c,
      async (stream) => {
        stream.onAbort(async () => {
          log.debug('stream aborted')
          closeSubscription()
          await pg.end()
        })

        stream.writeSSE({
          data: JSON.stringify(dbResult.result),
        })

        for (const table of tables) {
          await pg.subscribe(table, async () => {
            const dbResult = await executeSql({ db, query })
            stream.writeSSE({
              data: JSON.stringify(dbResult.result),
            })
          })
        }

        // const { unsubscribe } = await pg.subscribe(
        //   '*',
        //   (row, info) => {
        //     // console.log('🚀 ~ createApiServer ~ info:', info)
        //     // console.log('🚀 ~ createApiServer ~ row:', row)
        //     // Callback function for each row change
        //     // tell about new event row over eg. websockets or do something else
        //   },
        //   () => {
        //     log.debug('stream connected')
        //   },
        //   () => {
        //     log.debug('stream disconnected')
        //   }
        // )
        while (stream.closed === false && stream.aborted === false) {
          // keep the stream alive
          await stream.sleep(1000)
        }
      },
      async (e) => {
        log.error({ err: e }, 'stream error')
        closeSubscription()
        await pg.end()
      }
    )
  })

  app.get('/sql/db', async (c) => {
    const queryString = c.req.query('sql')
    if (!queryString) {
      return c.json({ error: 'sql query is required' }, 400)
    }
    const query = JSON.parse(queryString) as QueryWithTypings

    const result = await validateSql(query)
    if (result.error) {
      return c.json({ error: result.error.message }, 400)
    }

    const dbResult = await executeSql({ db, query })

    if (dbResult.error) {
      return c.json({ error: dbResult.error.message }, 500)
    }
    return c.json(dbResult.result, 200)
  })

  app.route('/', config.app({ db }))
  return app
}
