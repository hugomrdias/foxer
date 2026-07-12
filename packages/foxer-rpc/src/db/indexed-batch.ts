import type {
  EncodedBlock,
  EncodedLog,
  EncodedTransaction,
  IndexedBlockData,
} from '../types.ts'

/**
 * Returns the number of blocks in a backfill batch.
 */
export function countBlocks(batch: readonly IndexedBlockData[]): number {
  return batch.length
}

/**
 * Counts transactions across all blocks without building a flat array.
 */
export function countTransactions(batch: readonly IndexedBlockData[]): number {
  let count = 0
  for (const item of batch) {
    count += item.transactions.length
  }
  return count
}

/**
 * Counts logs across all blocks without building a flat array.
 */
export function countLogs(batch: readonly IndexedBlockData[]): number {
  let count = 0
  for (const item of batch) {
    count += item.logs.length
  }
  return count
}

/**
 * Lazily yields blocks in canonical backfill order.
 */
export function* iterateBlocks(
  batch: readonly IndexedBlockData[]
): Generator<EncodedBlock> {
  for (const item of batch) {
    yield item.block
  }
}

/**
 * Lazily yields transactions in canonical backfill order.
 */
export function* iterateTransactions(
  batch: readonly IndexedBlockData[]
): Generator<EncodedTransaction> {
  for (const item of batch) {
    for (const tx of item.transactions) {
      yield tx
    }
  }
}

/**
 * Lazily yields logs in canonical backfill order.
 */
export function* iterateLogs(
  batch: readonly IndexedBlockData[]
): Generator<EncodedLog> {
  for (const item of batch) {
    for (const log of item.logs) {
      yield log
    }
  }
}

/**
 * Flattens blocks into a preallocated array for the Drizzle insert writer.
 */
export function flattenBlocks(
  batch: readonly IndexedBlockData[]
): EncodedBlock[] {
  const blocks = new Array<EncodedBlock>(batch.length)
  for (let i = 0; i < batch.length; i++) {
    blocks[i] = batch[i].block
  }
  return blocks
}

/**
 * Flattens transactions into a preallocated array for the Drizzle insert writer.
 */
export function flattenTransactions(
  batch: readonly IndexedBlockData[]
): EncodedTransaction[] {
  const transactions = new Array<EncodedTransaction>(countTransactions(batch))
  let index = 0
  for (const item of batch) {
    for (const tx of item.transactions) {
      transactions[index] = tx
      index += 1
    }
  }
  return transactions
}

/**
 * Flattens logs into a preallocated array for the Drizzle insert writer.
 */
export function flattenLogs(batch: readonly IndexedBlockData[]): EncodedLog[] {
  const logs = new Array<EncodedLog>(countLogs(batch))
  let index = 0
  for (const item of batch) {
    for (const log of item.logs) {
      logs[index] = log
      index += 1
    }
  }
  return logs
}
