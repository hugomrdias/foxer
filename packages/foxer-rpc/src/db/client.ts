import { asc, desc, eq, sql } from 'drizzle-orm'
import {
  drizzle as drizzleNodePostgres,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import type { Logger } from '../utils/logger.ts'
import { schema } from './schema/index.ts'

type PreparedQueries = ReturnType<typeof generatePrepared>

export type Database = NodePgDatabase & {
  $client: Pool
  $prepared: PreparedQueries
}

export type DatabaseContext = {
  db: Database
  stop: () => Promise<void>
}

export type DatabaseRole = 'api' | 'sync'

/** Backfill and live sync run sequentially and share one connection. */
export const POSTGRES_POOL_MAX_SYNC = 1

const POSTGRES_ROLE_APPLICATION_NAME: Record<DatabaseRole, string> = {
  api: 'foxer-rpc-api',
  sync: 'foxer-rpc-sync',
}

/**
 * Opens the configured database and attaches prepared query helpers.
 */
export function createDatabase({
  databaseUrl,
  logger,
  role = 'api',
  maxConnections = 100,
}: {
  databaseUrl: string
  logger: Logger
  role?: DatabaseRole
  maxConnections?: number
}): DatabaseContext {
  const max = role === 'sync' ? POSTGRES_POOL_MAX_SYNC : maxConnections
  const pool = new Pool({
    application_name: POSTGRES_ROLE_APPLICATION_NAME[role],
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max,
    connectionString: databaseUrl,
  })
  pool.on('error', (err) => {
    logger.error({ err }, 'postgres pool error')
  })

  const db = drizzleNodePostgres({ client: pool }) as Database

  db.$prepared = generatePrepared(db)

  return {
    db,
    stop: async () => {
      await pool.end()
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

  const getReceiptTransactionByHash = db
    .select(receiptTransactionColumns)
    .from(schema.transactions)
    .where(eq(schema.transactions.hash, sql.placeholder('hash')))
    .limit(1)
    .prepare('get_receipt_transaction_by_hash')

  const getTransactionsByBlockNumber = db
    .select()
    .from(schema.transactions)
    .where(eq(schema.transactions.blockNumber, sql.placeholder('blockNumber')))
    .orderBy(asc(schema.transactions.transactionIndex))
    .prepare('get_transactions_by_block_number')

  const getReceiptTransactionsByBlockNumber = db
    .select(receiptTransactionColumns)
    .from(schema.transactions)
    .where(eq(schema.transactions.blockNumber, sql.placeholder('blockNumber')))
    .orderBy(asc(schema.transactions.transactionIndex))
    .prepare('get_receipt_transactions_by_block_number')

  const getTransactionHashesByBlockNumber = db
    .select({ hash: schema.transactions.hash })
    .from(schema.transactions)
    .where(eq(schema.transactions.blockNumber, sql.placeholder('blockNumber')))
    .orderBy(asc(schema.transactions.transactionIndex))
    .prepare('get_transaction_hashes_by_block_number')

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
    getReceiptTransactionByHash,
    getTransactionsByBlockNumber,
    getReceiptTransactionsByBlockNumber,
    getTransactionHashesByBlockNumber,
    getTransactionByBlockNumberAndIndex,
    getTransactionCountByBlockNumber,
    getLogsByBlockNumber,
    getLogsByTransactionPosition,
  }
}

const receiptTransactionColumns = {
  hash: schema.transactions.hash,
  blockNumber: schema.transactions.blockNumber,
  transactionIndex: schema.transactions.transactionIndex,
  from: schema.transactions.from,
  to: schema.transactions.to,
  type: schema.transactions.type,
  status: schema.transactions.status,
  receiptGasUsed: schema.transactions.receiptGasUsed,
  cumulativeGasUsed: schema.transactions.cumulativeGasUsed,
  effectiveGasPrice: schema.transactions.effectiveGasPrice,
  contractAddress: schema.transactions.contractAddress,
  logsBloom: schema.transactions.logsBloom,
}
