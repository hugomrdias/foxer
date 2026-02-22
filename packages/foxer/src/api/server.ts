import { and, desc, eq } from 'drizzle-orm'
import { Hono } from 'hono'
import type { Database } from '../db/client'
import { schema } from '../db/schema'
import { getBlockByIdOrLatest } from '../indexer/state'
import type { InternalConfig } from '../utils/types'

/**
 * Parses and clamps query limit values for list endpoints.
 */
function parseLimit(value: string | undefined): number {
  const parsed = Number(value ?? '50')
  if (!Number.isFinite(parsed)) return 50
  return Math.max(1, Math.min(parsed, 200))
}

/**
 * Parses and clamps query offset values for list endpoints.
 */
function parseOffset(value: string | undefined): number {
  const parsed = Number(value ?? '0')
  if (!Number.isFinite(parsed)) return 0
  return Math.max(0, Math.trunc(parsed))
}

/**
 * Builds the Hono API server with health and read endpoints.
 */
export function createApiServer({
  db,
  config,
}: {
  db: Database
  config: InternalConfig
}) {
  const app = new Hono()

  app.get('/health', async (c) => {
    const latest = (await getBlockByIdOrLatest({ db }))?.blockNumber ?? null
    return c.json({
      ok: true,
      latestIndexedBlock: latest?.toString() ?? null,
    })
  })

  // app.get('/session-keys', async (c) => {
  //   const limit = parseLimit(c.req.query('limit'))
  //   const offset = parseOffset(c.req.query('offset'))

  //   const rows = await db
  //     .select()
  //     .from(sessionsKeys)
  //     .orderBy(desc(sessionsKeys.blockNumber))
  //     .limit(limit)
  //     .offset(offset)

  //   return c.json({
  //     items: rows.map((row) => ({
  //       ...row,
  //       blockNumber: row.blockNumber.toString(),
  //     })),
  //     limit,
  //     offset,
  //   })
  // })

  // app.get('/datasets', async (c) => {
  //   const limit = parseLimit(c.req.query('limit'))
  //   const offset = parseOffset(c.req.query('offset'))
  //   const address = c.req.query('address')

  //   const rows = await db
  //     .select()
  //     .from(datasets)
  //     .orderBy(desc(datasets.blockNumber), desc(datasets.id))
  //     .where(address ? eq(datasets.accountAddress, address) : undefined)
  //     .limit(limit)
  //     .offset(offset)

  //   return c.json({
  //     items: rows.map((row) => ({
  //       ...row,
  //       id: row.id.toString(),
  //       pdpRailId: row.pdpRailId?.toString(),
  //       blockNumber: row.blockNumber.toString(),
  //       providerId: row.providerId?.toString(),
  //       cacheMissRailId: row.cacheMissRailId?.toString(),
  //       cdnRailId: row.cdnRailId?.toString(),
  //     })),
  //     limit,
  //     offset,
  //   })
  // })

  // app.get('/pieces', async (c) => {
  //   const limit = parseLimit(c.req.query('limit'))
  //   const offset = parseOffset(c.req.query('offset'))
  //   const address = c.req.query('address')

  //   const datasetId = c.req.query('datasetId')
  //   if (!address && !datasetId) {
  //     return c.json(
  //       {
  //         error: 'At least one filter is required: address and/or datasetId',
  //       },
  //       400
  //     )
  //   }

  //   const whereClauses = [
  //     address ? eq(pieces.accountAddress, address) : undefined,
  //     datasetId ? eq(pieces.datasetId, BigInt(datasetId)) : undefined,
  //   ].filter((clause) => clause != null)

  //   const where =
  //     whereClauses.length === 0
  //       ? undefined
  //       : whereClauses.length === 1
  //         ? whereClauses[0]
  //         : and(...whereClauses)

  //   const rows = await db
  //     .select()
  //     .from(pieces)
  //     .where(where)
  //     .orderBy(desc(pieces.blockNumber), desc(pieces.id))
  //     .limit(limit)
  //     .offset(offset)

  //   return c.json({
  //     items: rows.map((row) => ({
  //       ...row,
  //       id: row.id.toString(),
  //       blockNumber: row.blockNumber.toString(),
  //       datasetId: row.datasetId.toString(),
  //     })),
  //     limit,
  //     offset,
  //   })
  // })

  app.route('/', config.app)
  return app
}
