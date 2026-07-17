import { and, asc, eq, gt } from 'drizzle-orm'
import {
  drizzle as drizzleNodePostgres,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres'
import type { PoolClient } from 'pg'

import type { Database } from '../../../db/client.ts'
import { schema } from '../../../db/schema/index.ts'
import { JsonRpcConfigurationError } from '../errors.ts'
import type {
  StreamCapacityLimiter,
  StreamCapacityPermit,
} from '../stream-capacity.ts'

export const LOG_STREAM_BATCH_SIZE = 16_384

export type LogStreamConnectionDatabase = NodePgDatabase & {
  $client: PoolClient
}

/** Owns one read-only log snapshot and its database connection. */
export class LogStreamSession {
  readonly batchSize: number
  readonly client: PoolClient
  readonly db: LogStreamConnectionDatabase
  private readonly capacityPermit: StreamCapacityPermit
  private closed = false

  private constructor(args: {
    batchSize: number
    client: PoolClient
    db: LogStreamConnectionDatabase
    capacityPermit: StreamCapacityPermit
  }) {
    this.batchSize = args.batchSize
    this.client = args.client
    this.db = args.db
    this.capacityPermit = args.capacityPermit
  }

  static async open(
    database: Database,
    capacity: StreamCapacityLimiter,
    batchSize = LOG_STREAM_BATCH_SIZE
  ) {
    if (!Number.isSafeInteger(batchSize) || batchSize <= 0) {
      throw new JsonRpcConfigurationError(
        'log stream batch size must be a positive integer'
      )
    }

    const capacityPermit = capacity.acquire()
    let client: PoolClient | undefined
    try {
      client = await database.$client.connect()
      await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
      return new LogStreamSession({
        batchSize,
        client,
        db: drizzleNodePostgres({ client }),
        capacityPermit,
      })
    } catch (cause) {
      client?.release(true)
      capacityPermit.release()
      throw cause
    }
  }

  async *receiptLogs(args: { blockNumber: bigint; transactionIndex?: number }) {
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
    } finally {
      this.capacityPermit.release()
    }
  }
}
