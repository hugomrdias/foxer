import { PGlite } from '@electric-sql/pglite'
import { asc, desc, eq, sql } from 'drizzle-orm'
import {
  drizzle as drizzleNodePostgres,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres'
import {
  drizzle as drizzlePglite,
  type PgliteDatabase,
} from 'drizzle-orm/pglite'
import { Pool } from 'pg'

import type { DatabaseConfig } from '../config.ts'
import type { Logger } from '../utils/logger.ts'
import { schema } from './schema/index.ts'

type PreparedQueries = ReturnType<typeof generatePrepared>

export type Database =
  | (PgliteDatabase<typeof schema> & {
      $client: PGlite
      $prepared: PreparedQueries
    })
  | (NodePgDatabase<typeof schema> & {
      $client: Pool
      $prepared: PreparedQueries
    })

export type DatabaseContext = {
  db: Database
  driver: 'postgres' | 'pglite'
  stop: () => Promise<void>
}

/**
 * Narrows the shared database union to the PostgreSQL node-postgres driver.
 */
export function isPostgresDatabase(db: Database): db is NodePgDatabase<
  typeof schema
> & {
  $client: Pool
  $prepared: PreparedQueries
} {
  return db.$client instanceof Pool
}

/**
 * Opens the configured database and attaches prepared query helpers.
 *
 * Production uses node-postgres through Drizzle. Development can use PGlite,
 * which keeps local smoke tests self-contained. Both drivers expose the same
 * `$prepared` helpers so API and sync code do not need driver-specific paths.
 */
export function createDatabase({
  config,
  logger,
}: {
  config?: DatabaseConfig
  logger: Logger
}): DatabaseContext {
  if (config?.driver === 'postgres') {
    const pool = new Pool({
      application_name: 'foxer-rpc',
      connectionTimeoutMillis: 5_000,
      idleTimeoutMillis: 30_000,
      max: 20,
      connectionString: config.url,
    })
    pool.on('error', (err) => {
      logger.error({ err }, 'postgres pool error')
    })

    const db = drizzleNodePostgres({
      client: pool,
      schema,
      casing: 'snake_case',
    }) as Database

    db.$prepared = generatePrepared(db)

    return {
      db,
      driver: 'postgres',
      stop: async () => {
        await pool.end()
      },
    }
  }

  const client = new PGlite(
    config?.driver === 'pglite' ? config.directory : '.pglite'
  )
  const db = drizzlePglite({
    client,
    schema,
    casing: 'snake_case',
  }) as Database

  db.$prepared = generatePrepared(db)

  return {
    db,
    driver: 'pglite',
    stop: async () => {
      await client.close()
    },
  }
}

/**
 * Prepares the hot read queries used by the JSON-RPC API and reorg checks.
 *
 * These cover single-row lookups and ordered block-position scans. More dynamic
 * queries, such as filtered `eth_getLogs`, are intentionally built separately so
 * their SQL can match the requested filter shape.
 */
function generatePrepared(db: Omit<Database, '$prepared'>) {
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

  const getBlockByNumber = db
    .select()
    .from(schema.blocks)
    .where(eq(schema.blocks.number, sql.placeholder('blockNumber')))
    .limit(1)
    .prepare('get_block_by_number')

  const getBlockByHash = db
    .select()
    .from(schema.blocks)
    .where(eq(schema.blocks.hash, sql.placeholder('hash')))
    // Null-round placeholder rows reuse the previous real block hash. Prefer
    // the canonical real block when callers look up a block by hash.
    .orderBy(asc(schema.blocks.isNullRound), desc(schema.blocks.number))
    .limit(1)
    .prepare('get_block_by_hash')

  const getTransactionByHash = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.hash, sql.placeholder('hash')))
    .limit(1)
    .prepare('get_transaction_by_hash')

  const getTransactionsByBlockNumber = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.blockNumber, sql.placeholder('blockNumber')))
    .orderBy(asc(schema.transactions.transactionIndex))
    .prepare('get_transactions_by_block_number')

  const getTransactionByBlockNumberAndIndex = db
    .select()
    .from(schema.transactions)
    .where(
      sql`${schema.transactions.blockNumber} = ${sql.placeholder(
        'blockNumber'
      )} AND ${schema.transactions.transactionIndex} = ${sql.placeholder(
        'transactionIndex'
      )}`
    )
    .limit(1)
    .prepare('get_transaction_by_block_number_and_index')

  const getTransactionCountByBlockNumber = db
    .select({
      count: sql<number>`count(*)::int`,
    })
    .from(schema.transactions)
    .where(eq(schema.transactions.blockNumber, sql.placeholder('blockNumber')))
    .prepare('get_transaction_count_by_block_number')

  const getLogsByBlockNumber = db
    .select()
    .from(schema.logs)
    .where(eq(schema.logs.blockNumber, sql.placeholder('blockNumber')))
    .orderBy(asc(schema.logs.logIndex))
    .prepare('get_logs_by_block_number')

  const getLogsByTransactionPosition = db
    .select()
    .from(schema.logs)
    .where(
      sql`${schema.logs.blockNumber} = ${sql.placeholder(
        'blockNumber'
      )} AND ${schema.logs.transactionIndex} = ${sql.placeholder(
        'transactionIndex'
      )}`
    )
    .orderBy(asc(schema.logs.logIndex))
    .prepare('get_logs_by_transaction_position')

  return {
    getLatestBlock,
    getBlockByNumber,
    getBlockByHash,
    getTransactionByHash,
    getTransactionsByBlockNumber,
    getTransactionByBlockNumberAndIndex,
    getTransactionCountByBlockNumber,
    getLogsByBlockNumber,
    getLogsByTransactionPosition,
  }
}
