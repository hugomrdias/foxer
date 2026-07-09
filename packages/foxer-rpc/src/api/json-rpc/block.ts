import type { InternalConfig } from '../../config.ts'
import type { Database } from '../../db/client.ts'
import type { schema } from '../../db/schema/index.ts'
import { decodeBlock } from '../decode.ts'

/**
 * Loads a block's header, transactions, and logs, then builds the wire response.
 */
export async function decodeBlockByRow(
  args: { db: Database; config: InternalConfig },
  block: typeof schema.blocks.$inferSelect,
  fullTransactions: boolean
) {
  const [transactions, logs] = await Promise.all([
    args.db.$prepared.getTransactionsByBlockNumber.execute({
      blockNumber: block.number,
    }),
    args.db.$prepared.getLogsByBlockNumber.execute({
      blockNumber: block.number,
    }),
  ])
  return decodeBlock(
    block,
    transactions,
    logs,
    fullTransactions,
    args.config.chainId
  )
}
