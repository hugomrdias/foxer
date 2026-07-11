import { decodeReceipt } from '../../decode.ts'
import { resolveBlock } from '../block.ts'
import type { MethodContext } from '../types.ts'

/**
 * Implements `eth_getBlockReceipts` by grouping block logs per transaction.
 */
export async function ethGetBlockReceipts(
  args: MethodContext,
  params: unknown[]
) {
  const block = await resolveBlock(args, params[0])
  if (!block) return null

  const [transactions, logs] = await Promise.all([
    args.db.$prepared.getReceiptTransactionsByBlockNumber.execute({
      blockNumber: block.number,
    }),
    args.db.$prepared.getLogsByBlockNumber.execute({
      blockNumber: block.number,
    }),
  ])

  const logsByTransactionIndex = new Map<number, typeof logs>()

  for (const log of logs) {
    const transactionLogs = logsByTransactionIndex.get(log.transactionIndex)
    if (transactionLogs) {
      transactionLogs.push(log)
    } else {
      logsByTransactionIndex.set(log.transactionIndex, [log])
    }
  }

  return transactions.map((tx) =>
    decodeReceipt(
      tx,
      block,
      logsByTransactionIndex.get(tx.transactionIndex) ?? []
    )
  )
}
