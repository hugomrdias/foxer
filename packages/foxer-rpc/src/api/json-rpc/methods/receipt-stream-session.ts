import { and, asc, eq, gt } from 'drizzle-orm'
import {
  drizzle as drizzleNodePostgres,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres'
import type { PoolClient } from 'pg'

import type { Database } from '../../../db/client.ts'
import { schema } from '../../../db/schema/index.ts'

export const RECEIPT_LOG_BATCH_SIZE = 16_384

export type ReceiptConnectionDatabase = NodePgDatabase & {
  $client: PoolClient
}

/** Owns one read-only receipt snapshot and pages its logs in index order. */
export class ReceiptStreamSession {
  readonly batchSize: number
  readonly client: PoolClient
  readonly db: ReceiptConnectionDatabase
  private closed = false

  private constructor(args: {
    batchSize: number
    client: PoolClient
    db: ReceiptConnectionDatabase
  }) {
    this.batchSize = args.batchSize
    this.client = args.client
    this.db = args.db
  }

  static async open(database: Database, batchSize = RECEIPT_LOG_BATCH_SIZE) {
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
      throw new Error('receipt log batch size must be a positive integer')
    }

    const client = await database.$client.connect()
    try {
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      return new ReceiptStreamSession({
        batchSize,
        client,
        db: drizzleNodePostgres({ client }),
      })
    } catch (cause) {
      client.release(true)
      throw cause
    }
  }

  async *logs(args: { blockNumber: bigint; transactionIndex?: number }) {
    let lastLogIndex = -1

    while (true) {
      const filters = [
        eq(schema.logs.blockNumber, args.blockNumber),
        gt(schema.logs.logIndex, lastLogIndex),
      ]
      if (args.transactionIndex !== undefined) {
        filters.push(eq(schema.logs.transactionIndex, args.transactionIndex))
      }

      const rows = await this.db
        .select()
        .from(schema.logs)
        .where(and(...filters))
        .orderBy(asc(schema.logs.logIndex))
        .limit(this.batchSize)

      if (rows.length === 0) return

      for (const row of rows) {
        if (row.logIndex <= lastLogIndex) {
          throw new Error(
            `Block ${args.blockNumber} logs are not strictly ordered by log index`
          )
        }
        lastLogIndex = row.logIndex
        yield row
      }

      if (rows.length < this.batchSize) return
    }
  }

  async commit() {
    await this.close('COMMIT')
  }

  async rollback() {
    await this.close('ROLLBACK')
  }

  private async close(statement: 'COMMIT' | 'ROLLBACK') {
    if (this.closed) return
    this.closed = true
    try {
      await this.client.query(statement)
      this.client.release()
    } catch (cause) {
      this.client.release(true)
      throw cause
    }
  }
}
