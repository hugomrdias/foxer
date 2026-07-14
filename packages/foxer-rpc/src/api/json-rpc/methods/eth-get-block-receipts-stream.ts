import { asc, desc, eq } from 'drizzle-orm'

import type { InternalConfig } from '../../../config.ts'
import { type Database, receiptTransactionColumns } from '../../../db/client.ts'
import { schema } from '../../../db/schema/index.ts'
import { decodeLog, decodeReceiptFields } from '../../decode.ts'
import type { JsonRpcMethodStream } from '../stream.ts'
import type { StreamCapacityLimiter } from '../stream-capacity.ts'
import {
  requireHex,
  resolveBlockNumber,
  validateBlockParameter,
} from '../validation.ts'
import {
  LOG_STREAM_BATCH_SIZE,
  type LogStreamConnectionDatabase,
  LogStreamSession,
} from './log-stream-session.ts'

export const BLOCK_RECEIPT_LOG_BATCH_SIZE = LOG_STREAM_BATCH_SIZE

type BlockReference = Pick<typeof schema.blocks.$inferSelect, 'number' | 'hash'>
type ReceiptTransaction = Awaited<
  ReturnType<typeof selectReceiptTransactions>
>[number]

type PreparedBlockReceiptData = {
  block: BlockReference
  transactions: ReceiptTransaction[]
  session: LogStreamSession
}

/**
 * Streams `eth_getBlockReceipts` from one read-only database snapshot.
 *
 * The method registers its database lifecycle with the generic JSON-RPC stream,
 * then writes ordered receipts without returning transport-specific state.
 */
export async function streamEthGetBlockReceipts(
  args: {
    config: Pick<InternalConfig, 'finality'>
    db: Database
    streamCapacity: StreamCapacityLimiter
  },
  params: unknown[],
  stream: JsonRpcMethodStream,
  options: { batchSize?: number } = {}
) {
  validateBlockReference(params[0])
  const session = await LogStreamSession.open(
    args.db,
    args.streamCapacity,
    options.batchSize ?? BLOCK_RECEIPT_LOG_BATCH_SIZE
  )
  let block: BlockReference | null = null
  let transactions: ReceiptTransaction[] = []

  try {
    block = await resolveBlockReference(session.db, args.config, params[0])
    if (block) {
      transactions = await selectReceiptTransactions(session.db, block.number)
    }
  } catch (cause) {
    try {
      await session.rollback()
    } catch {
      // Preserve the query failure after forcing the connection closed.
    }
    throw cause
  }

  if (!block) {
    await session.rollback()
    await stream.result(null)
    return
  }
  if (transactions.length === 0) {
    await session.rollback()
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
    const logs = args.prepared.session.receiptLogs({
      blockNumber: args.prepared.block.number,
    })
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

function validateBlockReference(value: unknown) {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)) {
    requireHex(value, 'block hash', 32)
    return
  }
  validateBlockParameter(value)
}

async function resolveBlockReference(
  db: LogStreamConnectionDatabase,
  config: Pick<InternalConfig, 'finality'>,
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

  const blockNumber = await resolveBlockNumber({ config, db }, value)
  if (blockNumber == null) return null
  const rows = await db
    .select({ number: schema.blocks.number, hash: schema.blocks.hash })
    .from(schema.blocks)
    .where(eq(schema.blocks.number, blockNumber))
    .limit(1)
  return rows[0] ?? null
}

function selectReceiptTransactions(
  db: LogStreamConnectionDatabase,
  blockNumber: bigint
) {
  return db
    .select(receiptTransactionColumns)
    .from(schema.transactions)
    .where(eq(schema.transactions.blockNumber, blockNumber))
    .orderBy(asc(schema.transactions.transactionIndex))
}
