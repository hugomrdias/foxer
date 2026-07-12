import { describe, expect, test } from 'bun:test'
import { Writable } from 'node:stream'
import { eq } from 'drizzle-orm'
import { Pool, type PoolClient } from 'pg'

import type { Database } from '../src/db/client.ts'
import { createCopyTableMetrics } from '../src/db/copy/chunks.ts'
import {
  encodeBlockCopyRow,
  encodeCopyHeader,
  encodeCopyTrailer,
  encodeTransactionCopyRow,
} from '../src/db/copy/protocol.ts'
import {
  copyIndexedBlockData,
  runCopyTransaction,
} from '../src/db/copy/writer.ts'
import {
  appendToBackfillBatch,
  createBackfillBatch,
} from '../src/db/indexed-batch.ts'
import { schema } from '../src/db/schema/index.ts'
import type { IndexedBlockData } from '../src/types.ts'
import {
  encodeLogCopyRow,
  sampleBlock,
  sampleIndexedBatchEntry,
  sampleLog,
  sampleTransaction,
} from './copy-fixtures.ts'
import { createTestDatabaseContext } from './postgres.ts'

describe('COPY metrics', () => {
  test('calculates actual rates and finite zero-duration rates', () => {
    expect(
      createCopyTableMetrics(
        { rows: 2, encodedBytes: 2 * 1024 * 1024, chunks: 3 },
        1_000
      )
    ).toEqual({
      rows: 2,
      encodedBytes: 2 * 1024 * 1024,
      chunks: 3,
      durationMs: 1_000,
      mbPerSec: 2,
      rowsPerSec: 2,
    })

    const zeroDuration = createCopyTableMetrics(
      { rows: 2, encodedBytes: 100, chunks: 1 },
      0
    )
    expect(zeroDuration.mbPerSec).toBe(0)
    expect(zeroDuration.rowsPerSec).toBe(0)
    expect(Number.isFinite(zeroDuration.mbPerSec)).toBe(true)
    expect(Number.isFinite(zeroDuration.rowsPerSec)).toBe(true)
  })
})

describe('COPY transaction lifecycle', () => {
  test('commits and releases a healthy client', async () => {
    const queries: string[] = []
    const releases: Array<Error | undefined> = []
    const client = {
      query: (query: string) => {
        queries.push(query)
        return Promise.resolve()
      },
      release: (error?: Error) => {
        releases.push(error)
      },
    } as unknown as PoolClient

    await runCopyTransaction(client, () => Promise.resolve())

    expect(queries).toEqual(['BEGIN', 'COMMIT'])
    expect(releases).toEqual([undefined])
  })

  test('rolls back a COPY failure and preserves it', async () => {
    const originalError = new Error('copy failed')
    const queries: string[] = []
    const releases: Array<Error | undefined> = []
    const client = {
      query: (query: string) => {
        queries.push(query)
        return Promise.resolve()
      },
      release: (error?: Error) => {
        releases.push(error)
      },
    } as unknown as PoolClient

    let caught: unknown
    try {
      await runCopyTransaction(client, () => Promise.reject(originalError))
    } catch (error) {
      caught = error
    }

    expect(caught).toBe(originalError)
    expect(queries).toEqual(['BEGIN', 'ROLLBACK'])
    expect(releases).toEqual([undefined])
  })

  test('preserves COPY failure and evicts client when rollback fails', async () => {
    const originalError = new Error('copy failed')
    const rollbackError = new Error('rollback failed')
    const releases: Array<Error | undefined> = []
    const client = {
      query: (query: string) => {
        if (query === 'ROLLBACK') {
          return Promise.reject(rollbackError)
        }
        return Promise.resolve()
      },
      release: (error?: Error) => {
        releases.push(error)
      },
    } as unknown as PoolClient

    let caught: unknown
    try {
      await runCopyTransaction(client, () => Promise.reject(originalError))
    } catch (error) {
      caught = error
    }

    expect(caught).toBe(originalError)
    expect(releases).toEqual([rollbackError])
  })
})

test('copies tables in blocks, transactions, logs order', async () => {
  const pool = new Pool()
  const copyTables: string[] = []
  const client = {
    query: (query: string | { text: string }) => {
      if (typeof query === 'string') {
        return Promise.resolve()
      }

      const table = /^COPY "([^"]+)"/.exec(query.text)?.[1]
      if (table) {
        copyTables.push(table)
      }
      return new Writable({
        write(_chunk, _encoding, callback) {
          callback()
        },
      })
    },
    release: () => undefined,
  } as unknown as PoolClient
  pool.connect = (() => Promise.resolve(client)) as typeof pool.connect

  try {
    const entry = sampleIndexedBatchEntry(
      sampleBlock(),
      [sampleTransaction()],
      [sampleLog()]
    )
    const batch = backfillBatch([entry])
    await copyIndexedBlockData({
      db: { $client: pool } as Database,
      batch,
    })
    expect(copyTables).toEqual(['blocks', 'transactions', 'logs'])
    expect(batch.items).toEqual([])
    expect(batch.transactionCount).toBe(0)
    expect(batch.logCount).toBe(0)
    expect(batch.estimatedBytes).toBe(0)
    expect(entry.transactions).toEqual([])
    expect(entry.logs).toEqual([])
  } finally {
    await pool.end()
  }
})

test('copyIndexedBlockData returns before connecting for empty batches', async () => {
  const pool = new Pool()
  let connectCalls = 0
  pool.connect = (() => {
    connectCalls += 1
    throw new Error('unexpected connection')
  }) as typeof pool.connect

  try {
    const metrics = await copyIndexedBlockData({
      db: { $client: pool } as Database,
      batch: backfillBatch([]),
    })
    expect(connectCalls).toBe(0)
    expect(metrics).toEqual({
      blocks: {
        rows: 0,
        encodedBytes: 0,
        chunks: 0,
        durationMs: 0,
        mbPerSec: 0,
        rowsPerSec: 0,
      },
      transactions: {
        rows: 0,
        encodedBytes: 0,
        chunks: 0,
        durationMs: 0,
        mbPerSec: 0,
        rowsPerSec: 0,
      },
      logs: {
        rows: 0,
        encodedBytes: 0,
        chunks: 0,
        durationMs: 0,
        mbPerSec: 0,
        rowsPerSec: 0,
      },
    })
  } finally {
    await pool.end()
  }
})

describe('copyIndexedBlockData on PostgreSQL', () => {
  test('writes every block, transaction, and log column', async () => {
    const dbContext = await createTestDatabaseContext()
    const blockNumber = BigInt(Date.now())
    let migrated = false

    try {
      migrated = true

      await deleteTestBlock(dbContext.db, blockNumber)
      const block = sampleBlock(blockNumber)
      const tx = sampleTransaction(blockNumber)
      const log = sampleLog(blockNumber)

      const metrics = await copyIndexedBlockData({
        db: dbContext.db,
        batch: backfillBatch([sampleIndexedBatchEntry(block, [tx], [log])]),
      })

      expect(metrics.blocks.rows).toBe(1)
      expect(metrics.blocks.encodedBytes).toBe(
        encodeCopyHeader().length +
          encodeBlockCopyRow(block).length +
          encodeCopyTrailer().length
      )
      expect(metrics.blocks.chunks).toBe(1)
      expect(metrics.transactions.rows).toBe(1)
      expect(metrics.transactions.encodedBytes).toBe(
        encodeCopyHeader().length +
          encodeTransactionCopyRow(tx).length +
          encodeCopyTrailer().length
      )
      expect(metrics.transactions.chunks).toBe(1)
      expect(metrics.logs.rows).toBe(1)
      expect(metrics.logs.encodedBytes).toBe(
        encodeCopyHeader().length +
          encodeLogCopyRow(log).length +
          encodeCopyTrailer().length
      )
      expect(metrics.logs.chunks).toBe(1)
      for (const tableMetrics of Object.values(metrics)) {
        expect(tableMetrics.durationMs).toBeGreaterThanOrEqual(0)
        expect(Number.isFinite(tableMetrics.mbPerSec)).toBe(true)
        expect(Number.isFinite(tableMetrics.rowsPerSec)).toBe(true)
      }

      const [storedBlock] = await dbContext.db
        .select()
        .from(schema.blocks)
        .where(eq(schema.blocks.number, blockNumber))
      const [storedTx] = await dbContext.db
        .select()
        .from(schema.transactions)
        .where(eq(schema.transactions.hash, tx.hash))
      const [storedLog] = await dbContext.db
        .select()
        .from(schema.logs)
        .where(eq(schema.logs.blockNumber, blockNumber))

      expect(storedBlock).toEqual(block as typeof storedBlock)
      expect(storedTx).toEqual(tx as typeof storedTx)
      expect(storedLog).toEqual(log as typeof storedLog)
    } finally {
      try {
        if (migrated) {
          await deleteTestBlock(dbContext.db, blockNumber)
        }
      } finally {
        await dbContext.stop()
      }
    }
  })

  test('rolls back the whole batch when a duplicate block fails', async () => {
    const dbContext = await createTestDatabaseContext()
    const newBlockNumber = BigInt(Date.now()) + 10_000n
    const duplicateBlockNumber = newBlockNumber + 1n
    let migrated = false

    try {
      migrated = true
      await deleteTestBlock(dbContext.db, newBlockNumber)
      await deleteTestBlock(dbContext.db, duplicateBlockNumber)
      await dbContext.db
        .insert(schema.blocks)
        .values(sampleBlock(duplicateBlockNumber))

      await expect(
        copyIndexedBlockData({
          db: dbContext.db,
          batch: backfillBatch([
            sampleIndexedBatchEntry(sampleBlock(newBlockNumber)),
            sampleIndexedBatchEntry(sampleBlock(duplicateBlockNumber)),
          ]),
        })
      ).rejects.toThrow()

      const newBlocks = await dbContext.db
        .select()
        .from(schema.blocks)
        .where(eq(schema.blocks.number, newBlockNumber))
      expect(newBlocks).toEqual([])
    } finally {
      try {
        if (migrated) {
          await deleteTestBlock(dbContext.db, newBlockNumber)
          await deleteTestBlock(dbContext.db, duplicateBlockNumber)
        }
      } finally {
        await dbContext.stop()
      }
    }
  })
})

function backfillBatch(entries: IndexedBlockData[]) {
  const batch = createBackfillBatch()
  for (const entry of entries) {
    appendToBackfillBatch(batch, entry, 1)
  }
  return batch
}

async function deleteTestBlock(db: Database, blockNumber: bigint) {
  await db.delete(schema.logs).where(eq(schema.logs.blockNumber, blockNumber))
  await db
    .delete(schema.transactions)
    .where(eq(schema.transactions.blockNumber, blockNumber))
  await db.delete(schema.blocks).where(eq(schema.blocks.number, blockNumber))
}
