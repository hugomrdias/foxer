import { sValidator } from '@hono/standard-validator'
import { type Logger, sqlMiddleware } from 'foxer'
import { Hono } from 'hono'
import { type Address, isAddress, stringify } from 'viem'
import * as z from 'zod'
import type { Database } from '../foxer.config.ts'

export const zHex = z.custom<Address>((val) => {
  return typeof val === 'string' ? isAddress(val) : false
}, 'Invalid hex value')

export function buildApp({ db, logger }: { db: Database; logger: Logger }) {
  const app = new Hono()

  app.use('/sql/*', sqlMiddleware({ db, logger }))

  const datasetsParamsSchema = z.object({
    limit: z.coerce.number().min(1).max(100).optional().default(50),
    offset: z.coerce.number().optional().default(0),
    address: zHex.optional(),
  })
  app.get('/datasets', sValidator('query', datasetsParamsSchema), async (c) => {
    const { limit, offset, address } = c.req.valid('query')

    const rows = await db.query.datasets.findMany({
      where: address
        ? {
            payer: address ? address : undefined,
          }
        : undefined,
      orderBy: {
        blockNumber: 'desc',
        dataSetId: 'desc',
      },
      limit,
      offset,
    })

    return c.text(
      stringify({
        items: rows,
        limit,
        offset,
      }),
      200,
      { 'Content-Type': 'application/json' }
    )
  })

  const piecesParamsSchema = z.object({
    limit: z.coerce.number().min(1).max(100).optional().default(50),
    offset: z.coerce.number().optional().default(0),
    address: zHex.optional(),
    datasetId: z.coerce.bigint().optional(),
  })
  app.get('/pieces', sValidator('query', piecesParamsSchema), async (c) => {
    const { limit, offset, address, datasetId } = c.req.valid('query')

    const where = {
      ...(address ? { address } : undefined),
      ...(datasetId ? { datasetId } : undefined),
    }

    if (Object.keys(where).length === 0) {
      return c.text(
        'At least one filter is required: address and/or datasetId',
        400
      )
    }

    const rows = await db.query.pieces.findMany({
      where,
      orderBy: {
        blockNumber: 'desc',
        id: 'desc',
      },
      limit,
      offset,
    })

    return c.text(
      stringify({
        items: rows,
        limit,
        offset,
      }),
      200,
      { 'Content-Type': 'application/json' }
    )
  })

  return app
}
