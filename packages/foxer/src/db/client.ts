import { PGlite } from '@electric-sql/pglite'
import { desc, eq, sql } from 'drizzle-orm'
import {
  drizzle as drizzleNodePostgres,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres'
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite'
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations'
import { Pool, type PoolConfig } from 'pg'
import type { DatabaseConfig } from '../config/config.ts'
import type { Env } from '../config/env.ts'
import { type relations, schema } from './schema/index.ts'

export type Database<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> =
  | (PgliteDatabase<TSchema, TRelations> & {
      $client: PGlite
      $prepared: ReturnType<typeof generatePrepared>
    })
  | (NodePgDatabase<TSchema, TRelations> & {
      $client: Pool
      $prepared: ReturnType<typeof generatePrepared>
    })

export type DbDriver = 'pglite' | 'postgres'

export type DatabaseContext<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> =
  | {
      db: NodePgDatabase<TSchema, TRelations> & {
        $client: Pool
        $prepared: ReturnType<typeof generatePrepared>
      }
      driver: 'postgres'
      stop: () => Promise<void>
    }
  | {
      db: PgliteDatabase<TSchema, TRelations> & {
        $client: PGlite
        $prepared: ReturnType<typeof generatePrepared>
      }
      driver: 'pglite'
      stop: () => Promise<void>
    }

/**
 * Creates a typed Drizzle database context for either Postgres or PGlite.
 */
export function createDatabase<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
>({
  env,
  config,
  schema,
  relations,
}: {
  env: Env
  config?: DatabaseConfig
  schema: TSchema
  relations: TRelations
}): DatabaseContext<TSchema, TRelations> {
  let driver: string = 'pglite'
  let url: string | undefined
  let options: PoolConfig | undefined

  if (env.DATABASE_URL && typeof env.DATABASE_URL === 'string') {
    driver = 'postgres'
    url = env.DATABASE_URL
  } else if (config?.driver === 'postgres') {
    driver = config.driver
    url = config.url
    options = config.options
  }

  // Postgres
  if (driver === 'postgres' && url) {
    const pool = new Pool({
      ...options,
      connectionString: url,
    })
    const db = drizzleNodePostgres({
      client: pool,
      relations: relations,
      schema: schema,
      casing: 'snake_case',
    }) as NodePgDatabase<TSchema, TRelations> & {
      $client: Pool
      $prepared: ReturnType<typeof generatePrepared>
    }

    // @ts-expect-error - TODO: fix this
    db.$prepared = generatePrepared(db)

    return {
      db,
      driver: 'postgres',
      stop: async () => {
        await pool.end()
      },
    }
  }

  // PGlite
  const client = new PGlite(
    config?.driver === 'pglite' && config.directory
      ? config.directory
      : '.pglite'
  )
  const db = drizzlePglite({
    client: client,
    relations: relations,
    schema: schema,
    casing: 'snake_case',
  }) as PgliteDatabase<TSchema, TRelations> & {
    $client: PGlite
    $prepared: ReturnType<typeof generatePrepared>
  }

  // @ts-expect-error - TODO: fix this
  db.$prepared = generatePrepared(db)

  return {
    db,
    driver: 'pglite',
    stop: async () => {
      await client.close()
    },
  }
}

function generatePrepared(
  db: Omit<Database<typeof schema, typeof relations>, '$prepared'>
) {
  const getLatestBlock = db
    .select({
      number: schema.blocks.number,
      hash: schema.blocks.hash,
      parentHash: schema.blocks.parentHash,
    })
    .from(schema.blocks)
    .orderBy(desc(schema.blocks.number))
    .limit(1)
    .prepare('get_latest_block')

  const getBlockById = db
    .select({
      number: schema.blocks.number,
      hash: schema.blocks.hash,
      parentHash: schema.blocks.parentHash,
    })
    .from(schema.blocks)
    .where(eq(schema.blocks.number, sql.placeholder('blockNumber')))
    .prepare('get_block_by_id')

  const getBlocksInRange = db.query.blocks
    .findMany({
      with: {
        transactions: {
          where: {
            to: {
              in: sql.placeholder('contractAddresses'),
            },
          },
        },
      },
      where: {
        AND: [
          { number: { gte: sql.placeholder('firstBlockNumber') } },
          { number: { lte: sql.placeholder('lastBlockNumber') } },
        ],
      },
    })
    .prepare('get_blocks_in_range')

  return {
    getLatestBlock,
    getBlockById,
    getBlocksInRange,
  }
}
