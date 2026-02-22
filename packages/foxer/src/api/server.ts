import { PGlite } from '@electric-sql/pglite'
import type { Node, RawStmt } from '@pgsql/types'
import { Hono } from 'hono'
import { type PinoLogger, pinoLogger } from 'hono-pino'
import { parse } from 'libpg-query'
import { Pool } from 'pg'
import type { Database } from '../db/client.ts'
import { getBlockByIdOrLatest } from '../indexer/state.ts'
import { createComponentLogger } from '../logger.ts'
import type { InternalConfig } from '../utils/types.ts'

// biome-ignore lint/style/noNonNullAssertion: we know the node is not null
const getNodeType = (node: Node) => Object.keys(node)[0]!

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

  app.post('/sql', async (c) => {
    const { sql, params, method } = await c.req.json()

    const result = (await parse(sql)) as { stmts: RawStmt[] }

    if (result.stmts.length === 0) {
      return c.json({ error: 'No statement found' }, 400)
    }

    if (result.stmts.length > 1) {
      return c.json({ error: 'Only one statement is allowed' }, 400)
    }

    const stmt = result.stmts[0]
    if (stmt.stmt == null) {
      return c.json({ error: 'Invalid statement' }, 400)
    }

    const node = stmt.stmt
    const nodeType = getNodeType(node)

    if (nodeType !== 'SelectStmt') {
      return c.json({ error: 'Only select statements are allowed' }, 400)
    }

    if (!('SelectStmt' in node)) {
      return c.json({ error: 'Invalid statement' }, 400)
    }
    const selectStmt = node.SelectStmt
    if (selectStmt.lockingClause || selectStmt.intoClause) {
      return c.json({ error: 'Locking or into clauses are not allowed' }, 400)
    }
    if (selectStmt.withClause?.recursive) {
      return c.json({ error: 'Recursive with clauses are not allowed' }, 400)
    }

    if (!selectStmt.limitCount || !('ParamRef' in selectStmt.limitCount)) {
      return c.json({ error: 'Limit is required' }, 400)
    }
    const limitIndex = selectStmt.limitCount.ParamRef.number as number
    const limit = params[limitIndex - 1]

    if (limit > 100) {
      return c.json({ error: 'Limit is too large (max 100)' }, 400)
    }

    let dbResult: { rows: unknown[] } | undefined
    if (db.$client instanceof PGlite) {
      dbResult = await db.$client.query(sql, params, {
        rowMode: method === 'all' ? 'array' : undefined,
      })
    }
    if (db.$client instanceof Pool) {
      dbResult = await db.$client.query(
        {
          text: sql,
          values: params,
          ...(method === 'all' ? { rowMode: 'array' } : {}),
        },
        params
      )
    }

    if (!dbResult) {
      return c.json({ error: 'Internal server error' }, 500)
    }

    try {
      return c.json(dbResult.rows, 200)
    } catch (error) {
      log.error({ error }, 'sql query failed')
      return c.json({ error: 'Internal server error' }, 500)
    }
  })

  app.route('/', config.app({ db }))
  return app
}
