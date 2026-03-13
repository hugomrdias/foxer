import type { QueryWithTypings } from 'drizzle-orm'
import { createMiddleware } from 'hono/factory'
import { streamSSE } from 'hono/streaming'
import postgres from 'postgres'

import { PUBLICATION_NAME } from '../contants.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import { executeSql, validateSql } from './sql.ts'
import { sseError } from './sse.ts'

const MAX_LIVE_QUERIES = 1000

export function sqlMiddleware({ db, logger }: { db: Database; logger: Logger }) {
  let pg: postgres.Sql | undefined
  const databaseUrl = process.env.DATABASE_URL

  if (databaseUrl && typeof databaseUrl === 'string') {
    // TODO: kill gracefully
    pg = postgres(databaseUrl, {
      publications: PUBLICATION_NAME,
    })
  }

  let liveQueryCount = 0

  return createMiddleware(async (c, next) => {
    // SQL over HTTP endpoint
    if (c.req.path === '/sql/db') {
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
    }

    // Live SQL over SSE endpoint
    if (c.req.path === '/sql/live') {
      if (liveQueryCount >= MAX_LIVE_QUERIES) {
        return sseError(c, 'Too many live queries')
      }

      const queryString = c.req.query('sql')
      if (!queryString) {
        return sseError(c, 'SQL query is required')
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

      if (!pg) {
        return sseError(
          c,
          'Database connection not established. Please check your DATABASE_URL environment variable.',
        )
      }

      const subscriptions: (() => void)[] = []
      liveQueryCount++

      return streamSSE(
        c,
        async (stream) => {
          stream.onAbort(() => {
            liveQueryCount--
            logger.trace('stream aborted')
            subscriptions.forEach((unsubscribe) => {
              unsubscribe()
            })
          })

          await stream.writeSSE({
            data: JSON.stringify(dbResult.result),
          })

          for (const table of tables) {
            const sub = await pg.subscribe(`*:${table}`, async () => {
              const dbResult = await executeSql({ db, query })
              await stream.writeSSE({
                data: JSON.stringify(dbResult.result),
              })
            })
            subscriptions.push(() => sub.unsubscribe())
          }

          while (stream.closed === false && stream.aborted === false) {
            // keep the stream alive
            await stream.sleep(1000)
          }
        },
        (error) => {
          logger.error({ error }, 'stream error')
          subscriptions.forEach((unsubscribe) => {
            unsubscribe()
          })
          return Promise.resolve(undefined)
        },
      )
    }

    return next()
  })
}
