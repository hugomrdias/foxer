import { and, asc, desc, eq, gt } from 'drizzle-orm'
import {
  drizzle as drizzleNodePostgres,
  type NodePgDatabase,
} from 'drizzle-orm/node-postgres'
import type { PoolClient } from 'pg'

import { type Database, receiptTransactionColumns } from '../../../db/client.ts'
import { schema } from '../../../db/schema/index.ts'
import { decodeLog, decodeReceiptFields } from '../../decode.ts'
import type { JsonRpcMethodStream } from '../stream.ts'
import { requireHex, requireQuantity } from '../validation.ts'

export const BLOCK_RECEIPT_LOG_BATCH_SIZE = 16_384

type ConnectionDatabase = NodePgDatabase & { $client: PoolClient }
type BlockReference = Pick<typeof schema.blocks.$inferSelect, 'number' | 'hash'>
type ReceiptTransaction = Awaited<
  ReturnType<typeof selectReceiptTransactions>
>[number]

type PreparedBlockReceiptData = {
  block: BlockReference
  transactions: ReceiptTransaction[]
  session: BlockReceiptStreamSession
}

/**
 * Streams `eth_getBlockReceipts` from one read-only database snapshot.
 *
 * The method registers its database lifecycle with the generic JSON-RPC stream,
 * then writes ordered receipts without returning transport-specific state.
 */
export async function streamEthGetBlockReceipts(
  args: { db: Database },
  params: unknown[],
  stream: JsonRpcMethodStream,
  options: { batchSize?: number } = {}
) {
  const client = await args.db.$client.connect()
  const connectionDb = drizzleNodePostgres({ client })
  let transactionOpen = false
  let block: BlockReference | null = null
  let transactions: ReceiptTransaction[] = []
  let session: BlockReceiptStreamSession | undefined

  try {
    await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY')
    transactionOpen = true

    block = await resolveBlockReference(connectionDb, params[0])
    if (block) {
      transactions = await selectReceiptTransactions(connectionDb, block.number)
      if (transactions.length === 0) {
        await client.query('ROLLBACK')
        transactionOpen = false
        client.release()
      } else {
        session = new BlockReceiptStreamSession({
          batchSize: options.batchSize ?? BLOCK_RECEIPT_LOG_BATCH_SIZE,
          blockNumber: block.number,
          client,
          db: connectionDb,
        })
        transactionOpen = false
      }
    } else {
      await client.query('ROLLBACK')
      transactionOpen = false
      client.release()
    }
  } catch (cause) {
    if (transactionOpen) {
      try {
        await client.query('ROLLBACK')
      } catch {
        client.release(true)
        throw cause
      }
    }
    client.release()
    throw cause
  }

  if (!block) {
    await stream.result(null)
    return
  }
  if (!session) {
    await stream.resultArray(() => undefined)
    return
  }

  const prepared = { block, session, transactions }
  stream.beforeFinish(() => session.commit())
  stream.onError(() => session.rollback())
  await writePreparedBlockReceiptResult({ prepared, stream })
}

/**
 * Writes one JSON-RPC block-receipt result while reading ordered logs in bounded
 * batches. Only one decoded log and one database batch are retained at a time.
 */
async function writePreparedBlockReceiptResult(args: {
  prepared: PreparedBlockReceiptData
  stream: JsonRpcMethodStream
}) {
  await args.stream.resultArray(async (receipts) => {
    const logs = args.prepared.session.logs()
    let nextLog = await logs.next()

    for (
      let txIndex = 0;
      txIndex < args.prepared.transactions.length;
      txIndex++
    ) {
      const tx = args.prepared.transactions[txIndex]
      if (!tx) throw new Error('missing receipt transaction')

      if (
        !nextLog.done &&
        nextLog.value.transactionIndex < tx.transactionIndex
      ) {
        throw new Error(
          `Block ${args.prepared.block.number} log ${nextLog.value.logIndex} references missing transaction ${nextLog.value.transactionIndex}`
        )
      }

      await receipts.object(async (receipt) => {
        await receipt.values(decodeReceiptFields(tx, args.prepared.block))
        await receipt.array('logs', async (receiptLogs) => {
          while (
            !nextLog.done &&
            nextLog.value.transactionIndex === tx.transactionIndex
          ) {
            await receiptLogs.value(
              decodeLog(nextLog.value, args.prepared.block, tx)
            )
            nextLog = await logs.next()
          }
        })
      })
    }

    if (!nextLog.done) {
      throw new Error(
        `Block ${args.prepared.block.number} log ${nextLog.value.logIndex} references missing transaction ${nextLog.value.transactionIndex}`
      )
    }
  })
}

class BlockReceiptStreamSession {
  readonly batchSize: number
  readonly blockNumber: bigint
  readonly client: PoolClient
  readonly db: ConnectionDatabase
  private closed = false

  constructor(args: {
    batchSize: number
    blockNumber: bigint
    client: PoolClient
    db: ConnectionDatabase
  }) {
    if (!Number.isSafeInteger(args.batchSize) || args.batchSize <= 0) {
      throw new Error('block receipt log batch size must be a positive integer')
    }
    this.batchSize = args.batchSize
    this.blockNumber = args.blockNumber
    this.client = args.client
    this.db = args.db
  }

  async *logs() {
    let lastLogIndex = -1

    while (true) {
      const rows = await this.db
        .select()
        .from(schema.logs)
        .where(
          and(
            eq(schema.logs.blockNumber, this.blockNumber),
            gt(schema.logs.logIndex, lastLogIndex)
          )
        )
        .orderBy(asc(schema.logs.logIndex))
        .limit(this.batchSize)

      if (rows.length === 0) return

      for (const row of rows) {
        if (row.logIndex <= lastLogIndex) {
          throw new Error(
            `Block ${this.blockNumber} logs are not strictly ordered by log index`
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

async function resolveBlockReference(
  db: ConnectionDatabase,
  value: unknown
): Promise<BlockReference | null> {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)) {
    const hash = requireHex(value, 'block hash', 32)
    const rows = await db
      .select({ number: schema.blocks.number, hash: schema.blocks.hash })
      .from(schema.blocks)
      .where(eq(schema.blocks.hash, hash))
      .orderBy(asc(schema.blocks.isNullRound), desc(schema.blocks.number))
      .limit(1)
    return rows[0] ?? null
  }

  if (
    value == null ||
    value === 'latest' ||
    value === 'safe' ||
    value === 'finalized' ||
    value === 'pending'
  ) {
    const rows = await db
      .select({ number: schema.blocks.number, hash: schema.blocks.hash })
      .from(schema.blocks)
      .orderBy(desc(schema.blocks.number))
      .limit(1)
    return rows[0] ?? null
  }

  const blockNumber =
    value === 'earliest' ? 0n : requireQuantity(value, 'block parameter')
  const rows = await db
    .select({ number: schema.blocks.number, hash: schema.blocks.hash })
    .from(schema.blocks)
    .where(eq(schema.blocks.number, blockNumber))
    .limit(1)
  return rows[0] ?? null
}

function selectReceiptTransactions(
  db: ConnectionDatabase,
  blockNumber: bigint
) {
  return db
    .select(receiptTransactionColumns)
    .from(schema.transactions)
    .where(eq(schema.transactions.blockNumber, blockNumber))
    .orderBy(asc(schema.transactions.transactionIndex))
}
