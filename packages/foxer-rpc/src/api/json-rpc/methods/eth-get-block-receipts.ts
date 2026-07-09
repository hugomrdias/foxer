import { decodeReceipt } from '../../decode.ts'
import type { MethodContext } from '../types.ts'
import { resolveBlockNumber } from '../validation.ts'

/**
 * Implements `eth_getBlockReceipts` by grouping block logs per transaction.
 */
export async function ethGetBlockReceipts(
  args: MethodContext,
  params: unknown[]
) {
  const blockNumber = await resolveBlockNumber(args, params[0])
  if (blockNumber == null) return null
  const [block, transactions, logs] = await Promise.all([
    args.db.$prepared.getBlockByNumber.execute({ blockNumber }),
    args.db.$prepared.getTransactionsByBlockNumber.execute({ blockNumber }),
    args.db.$prepared.getLogsByBlockNumber.execute({ blockNumber }),
  ])
  if (!block[0]) return null
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
      block[0],
      logsByTransactionIndex.get(tx.transactionIndex) ?? []
    )
  )
}
