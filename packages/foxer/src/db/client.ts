import { PGlite } from '@electric-sql/pglite'
import {
  drizzle as drizzleNodePg,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres'
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite'
import { Pool } from 'pg'

import { env } from '../config/env.ts'
import { relations, schema } from './schema/index.ts'

export type Database =
  | PgliteDatabase<typeof schema, typeof relations>
  | NodePgDatabase<typeof schema, typeof relations>
export type DbDriver = 'pglite' | 'postgres'

export type DatabaseContext =
  | {
      db: NodePgDatabase<typeof schema, typeof relations>
      driver: 'postgres'
      close: () => Promise<void>
    }
  | {
      db: PgliteDatabase<typeof schema, typeof relations>
      driver: 'pglite'
      close: () => Promise<void>
    }

/**
 * Creates a typed Drizzle database context for either Postgres or PGlite.
 */
export function createDatabase(): DatabaseContext {
  if (env.DB_DRIVER === 'postgres') {
    const pool = new Pool({ connectionString: env.DATABASE_URL })
    const db = drizzleNodePg({
      client: pool,
      relations: relations,
      schema: schema,
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
  })

  return {
    db,
    driver: 'pglite',
    close: async () => {
      await client.close()
    },
  }
}
