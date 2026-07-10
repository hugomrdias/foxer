import { gte } from 'drizzle-orm'

import { MAX_QUERY_PARAMS } from '../contants.ts'
import type {
  EncodedBlock,
  EncodedLog,
  EncodedTransaction,
  IndexedBlockData,
} from '../types.ts'
import type { Database } from './client.ts'
import {
  flattenBlocks,
  flattenLogs,
  flattenTransactions,
} from './indexed-batch.ts'
import { schema } from './schema/index.ts'
import { withTransaction } from './transaction.ts'

const BLOCK_INSERT_WIDTH = 14
const TRANSACTION_INSERT_WIDTH = 22
const LOG_INSERT_WIDTH = 9

/**
 * Persists a batch of canonical block data across the three fixed tables.
 *
 * Blocks, transactions, and logs are inserted in one transaction so API readers
 * never observe a partially written block. Individual table inserts are chunked
 * below Postgres' parameter limit by the helper functions.
 */
export async function insertIndexedBlockData(args: {
  db: Database
  batch: IndexedBlockData[]
}) {
  const blocks = flattenBlocks(args.batch)
  const transactions = flattenTransactions(args.batch)
  const logs = flattenLogs(args.batch)

  await withTransaction(args.db, async (tx) => {
    await insertBlocksInChunks(tx, blocks)
    await insertTransactionsInChunks(tx, transactions)
    await insertLogsInChunks(tx, logs)
  })
}

/**
 * Deletes all canonical data at or after a block height.
 *
 * Reorg rewinds use this to remove derived rows before replaying from the
 * upstream chain. Deleting logs first, then transactions, then blocks preserves
 * the logical dependency order even without foreign keys.
 */
export async function deleteBlocksFrom(db: Database, fromBlock: bigint) {
  await withTransaction(db, async (tx) => {
    await tx.delete(schema.logs).where(gte(schema.logs.blockNumber, fromBlock))
    await tx
      .delete(schema.transactions)
      .where(gte(schema.transactions.blockNumber, fromBlock))
    await tx.delete(schema.blocks).where(gte(schema.blocks.number, fromBlock))
  })
}

/**
 * Inserts block rows in parameter-safe chunks.
 *
 * Conflicts on block number are ignored so restart/retry paths can replay a
 * batch without failing if some rows were already committed.
 */
async function insertBlocksInChunks(db: Database, blocks: EncodedBlock[]) {
  if (blocks.length === 0) return

  const batchSize = Math.floor(MAX_QUERY_PARAMS / BLOCK_INSERT_WIDTH)
  for (let i = 0; i < blocks.length; i += batchSize) {
    await db
      .insert(schema.blocks)
      .values(blocks.slice(i, i + batchSize))
      .onConflictDoNothing({ target: [schema.blocks.number] })
  }
}

/**
 * Inserts transaction rows in parameter-safe chunks.
 *
 * The transaction hash is the stable primary key. Receipt fields are already
 * merged into each row before this helper is called.
 */
async function insertTransactionsInChunks(
  db: Database,
  transactions: EncodedTransaction[]
) {
  if (transactions.length === 0) return

  const batchSize = Math.floor(MAX_QUERY_PARAMS / TRANSACTION_INSERT_WIDTH)
  for (let i = 0; i < transactions.length; i += batchSize) {
    await db
      .insert(schema.transactions)
      .values(transactions.slice(i, i + batchSize))
      .onConflictDoNothing({ target: [schema.transactions.hash] })
  }
}

/**
 * Inserts log rows in parameter-safe chunks.
 *
 * Logs are keyed by `(blockNumber, logIndex)`, matching Ethereum's canonical
 * log ordering and supporting ordered `eth_getLogs` scans.
 */
async function insertLogsInChunks(db: Database, logs: EncodedLog[]) {
  if (logs.length === 0) return

  const batchSize = Math.floor(MAX_QUERY_PARAMS / LOG_INSERT_WIDTH)
  for (let i = 0; i < logs.length; i += batchSize) {
    await db
      .insert(schema.logs)
      .values(logs.slice(i, i + batchSize))
      .onConflictDoNothing({
        target: [schema.logs.blockNumber, schema.logs.logIndex],
      })
  }
}
