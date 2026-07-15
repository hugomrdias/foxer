/**
 * PostgreSQL COPY streaming: pg-copy-streams integration and indexed-batch writes.
 */
import { pipeline } from 'node:stream/promises'
import type { PoolClient } from 'pg'
import { from as copyFrom } from 'pg-copy-streams'

import type { EncodedLog, IndexedBlockData } from '../../types.ts'
import type { Database } from '../client.ts'
import {
  consumeLogs,
  consumeTransactions,
  countLogs,
  countTransactions,
  iterateBlocks,
} from '../indexed-batch.ts'
import {
  type CopyChunkStats,
  type CopyTableMetrics,
  createCopyReadable,
  createCopyTableMetrics,
  encodeBoundedBufferCopyChunks,
  encodeBoundedLogCopyChunks,
} from './chunks.ts'
import {
  BLOCK_COPY_COLUMNS,
  DEFAULT_COPY_CHUNK_BYTES,
  LOG_COPY_COLUMNS,
  TRANSACTION_COPY_COLUMNS,
} from './constants.ts'
import {
  buildCopySql,
  encodeBlockCopyRow,
  encodeTransactionCopyRow,
} from './protocol.ts'

/**
 * COPY metrics grouped by table for one indexed batch write.
 */
export type CopyMetrics = {
  blocks: CopyTableMetrics
  transactions: CopyTableMetrics
  logs: CopyTableMetrics
}

function toError(value: unknown): Error {
  return value instanceof Error ? value : new Error(String(value))
}

/**
 * Runs COPY work in a transaction and releases its dedicated pool client.
 *
 * The original write error is preserved if rollback also fails. In that case,
 * the rollback error is passed to `release` so node-postgres evicts the client.
 */
export async function runCopyTransaction(
  client: PoolClient,
  write: () => Promise<void>
): Promise<void> {
  let transactionStarted = false
  let releaseError: Error | undefined

  try {
    try {
      await client.query('BEGIN')
      transactionStarted = true
      await write()
      await client.query('COMMIT')
    } catch (error) {
      if (transactionStarted) {
        try {
          await client.query('ROLLBACK')
        } catch (rollbackError) {
          releaseError = toError(rollbackError)
        }
      } else {
        releaseError = toError(error)
      }
      throw error
    }
  } finally {
    client.release(releaseError)
  }
}

/**
 * Pipes bounded COPY chunks into PostgreSQL and returns generator statistics.
 */
async function streamBoundedCopyChunks(
  stream: NodeJS.WritableStream,
  generator: Generator<Buffer, CopyChunkStats>,
  chunkBytes: number
): Promise<CopyChunkStats> {
  let stats: CopyChunkStats = { rows: 0, encodedBytes: 0, chunks: 0 }

  function* trackedChunks() {
    while (true) {
      const next = generator.next()
      if (next.done) {
        stats = next.value ?? stats
        return
      }
      yield next.value
    }
  }

  await pipeline(createCopyReadable(trackedChunks(), chunkBytes), stream)

  return stats
}

/**
 * Streams one table's binary COPY payload through an existing client connection.
 */
async function copyTableRows<T>(
  client: PoolClient,
  table: string,
  columns: readonly string[],
  rows: Iterable<T>,
  encodeRow: (row: T) => Buffer,
  chunkBytes: number
): Promise<CopyTableMetrics> {
  const startedAt = Date.now()
  const stream = client.query(copyFrom(buildCopySql(table, columns)))
  const stats = await streamBoundedCopyChunks(
    stream,
    encodeBoundedBufferCopyChunks(rows, encodeRow, chunkBytes),
    chunkBytes
  )

  return createCopyTableMetrics(stats, Date.now() - startedAt)
}

/**
 * Streams log rows through the direct COPY codec and bounded chunk generator.
 */
async function copyLogTableRows(
  client: PoolClient,
  rows: Iterable<EncodedLog>,
  chunkBytes: number
): Promise<CopyTableMetrics> {
  const startedAt = Date.now()
  const stream = client.query(copyFrom(buildCopySql('logs', LOG_COPY_COLUMNS)))
  const stats = await streamBoundedCopyChunks(
    stream,
    encodeBoundedLogCopyChunks(rows, chunkBytes),
    chunkBytes
  )

  return createCopyTableMetrics(stats, Date.now() - startedAt)
}

function emptyCopyTableMetrics(): CopyTableMetrics {
  return {
    rows: 0,
    encodedBytes: 0,
    chunks: 0,
    durationMs: 0,
    mbPerSec: 0,
    rowsPerSec: 0,
  }
}

function emptyCopyMetrics(): CopyMetrics {
  return {
    blocks: emptyCopyTableMetrics(),
    transactions: emptyCopyTableMetrics(),
    logs: emptyCopyTableMetrics(),
  }
}

/**
 * Persists indexed block data with one atomic PostgreSQL binary COPY batch.
 *
 * A dedicated pool client is acquired for the whole operation. All non-empty
 * tables are copied inside a single transaction so readers never observe a
 * partially written batch. Duplicate primary-key rows fail the COPY and roll
 * back the transaction.
 */
export async function copyIndexedBlockData(args: {
  db: Database
  batch: IndexedBlockData[]
}): Promise<CopyMetrics> {
  if (args.batch.length === 0) {
    return emptyCopyMetrics()
  }

  const transactionCount = countTransactions(args.batch)
  const logCount = countLogs(args.batch)
  const metrics = emptyCopyMetrics()
  const client = await args.db.$client.connect()
  await runCopyTransaction(client, async () => {
    metrics.blocks = await copyTableRows(
      client,
      'blocks',
      BLOCK_COPY_COLUMNS,
      iterateBlocks(args.batch),
      encodeBlockCopyRow,
      DEFAULT_COPY_CHUNK_BYTES
    )
    if (transactionCount > 0) {
      metrics.transactions = await copyTableRows(
        client,
        'transactions',
        TRANSACTION_COPY_COLUMNS,
        consumeTransactions(args.batch),
        encodeTransactionCopyRow,
        DEFAULT_COPY_CHUNK_BYTES
      )
    }
    if (logCount > 0) {
      metrics.logs = await copyLogTableRows(
        client,
        consumeLogs(args.batch),
        DEFAULT_COPY_CHUNK_BYTES
      )
    }
  })
  args.batch.length = 0

  return metrics
}
