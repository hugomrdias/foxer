import { PGlite } from '@electric-sql/pglite'
import { getColumns, type SQL, sql } from 'drizzle-orm'
import {
  drizzle as drizzleNodePg,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres'
import type { PgTable } from 'drizzle-orm/pg-core'
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite'
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations'
import { Pool } from 'pg'
import { snakeCase } from 'scule'
import { env } from '../config/env.ts'

export type Database<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> =
  | (PgliteDatabase<TSchema, TRelations> & {
      $client: PGlite
    })
  | (NodePgDatabase<TSchema, TRelations> & {
      $client: Pool
    })

export type DbDriver = 'pglite' | 'postgres'

export type DatabaseContext<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> =
  | {
      db: NodePgDatabase<TSchema, TRelations>
      driver: 'postgres'
      close: () => Promise<void>
    }
  | {
      db: PgliteDatabase<TSchema, TRelations>
      driver: 'pglite'
      close: () => Promise<void>
    }

/**
 * Creates a typed Drizzle database context for either Postgres or PGlite.
 */
export function createDatabase<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
>({
  schema,
  relations,
}: {
  schema: TSchema
  relations: TRelations
}): DatabaseContext<TSchema, TRelations> {
  if (env.DB_DRIVER === 'postgres') {
    const pool = new Pool({ connectionString: env.DATABASE_URL })
    const db = drizzleNodePg({
      client: pool,
      relations: relations,
      schema: schema,
      casing: 'snake_case',
    })

    return {
      db,
      driver: 'postgres',
      close: async () => {
        await pool.end()
      },
    }
  }

  const client = new PGlite(env.PGLITE_DATA_DIR)
  const db = drizzlePglite({
    client: client,
    relations: relations,
    schema: schema,
    casing: 'snake_case',
  })

  return {
    db,
    driver: 'pglite',
    close: async () => {
      await client.close()
    },
  }
}

export const buildConflictUpdateColumns = <
  T extends PgTable,
  Q extends keyof T['_']['columns'],
>(
  table: T,
  columns?: Q[]
) => {
  const cls = getColumns(table)
  const cols = columns ?? (Object.keys(cls) as Q[])
  const r = cols.reduce(
    (acc, column) => {
      const colName = snakeCase(cls[column].name)

      acc[column] = sql.raw(`excluded.${colName}`)
      return acc
    },
    {} as Record<Q, SQL>
  )

  return r
}
