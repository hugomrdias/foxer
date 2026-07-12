import { eq } from 'drizzle-orm'

import { type Database, receiptTransactionColumns } from '../../../db/client.ts'
import { schema } from '../../../db/schema/index.ts'
import { decodeLog, decodeReceiptFields } from '../../decode.ts'
import type { JsonRpcMethodStream } from '../stream.ts'
import { requireHex } from '../validation.ts'
import {
  RECEIPT_LOG_BATCH_SIZE,
  ReceiptStreamSession,
} from './receipt-stream-session.ts'

/** Streams one transaction receipt and its ordered logs from one DB snapshot. */
export async function streamEthGetTransactionReceipt(
  args: { db: Database },
  params: unknown[],
  stream: JsonRpcMethodStream,
  options: { batchSize?: number } = {}
) {
  const hash = requireHex(params[0], 'transaction hash', 32)
  const session = await ReceiptStreamSession.open(
    args.db,
    options.batchSize ?? RECEIPT_LOG_BATCH_SIZE
  )

  let tx: Awaited<ReturnType<typeof selectReceiptTransaction>>[number]
  let block: { hash: typeof schema.blocks.$inferSelect.hash } | undefined

  try {
    tx = (await selectReceiptTransaction(session, hash))[0]
    if (tx) {
      block = (
        await session.db
          .select({ hash: schema.blocks.hash })
          .from(schema.blocks)
          .where(eq(schema.blocks.number, tx.blockNumber))
          .limit(1)
      )[0]
    }
  } catch (cause) {
    try {
      await session.rollback()
    } catch {
      // Preserve the query failure after forcing the connection closed.
    }
    throw cause
  }

  if (!(tx && block)) {
    await session.rollback()
    await stream.result(null)
    return
  }

  stream.beforeFinish(() => session.commit())
  stream.onError(() => session.rollback())
  await stream.resultObject(async (receipt) => {
    await receipt.values(decodeReceiptFields(tx, block))
    await receipt.array('logs', async (logs) => {
      for await (const log of session.logs({
        blockNumber: tx.blockNumber,
        transactionIndex: tx.transactionIndex,
      })) {
        await logs.value(decodeLog(log, block, tx))
      }
    })
  })
}

function selectReceiptTransaction(
  session: ReceiptStreamSession,
  hash: typeof schema.transactions.$inferSelect.hash
) {
  return session.db
    .select(receiptTransactionColumns)
    .from(schema.transactions)
    .where(eq(schema.transactions.hash, hash))
    .limit(1)
}
