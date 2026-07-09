import type { InternalConfig } from '../../config.ts'
import type { Database } from '../../db/client.ts'
import { decodeTransaction } from '../decode.ts'
import { requireQuantityNumber } from './validation.ts'

/**
 * Loads a transaction by canonical block position and decodes it.
 */
export async function getTransactionByBlockNumberAndIndex(
  args: { db: Database; config: InternalConfig },
  blockNumber: bigint,
  index: unknown
) {
  const transactionIndex = requireQuantityNumber(index, 'index')
  const [tx, block] = await Promise.all([
    args.db.$prepared.getTransactionByBlockNumberAndIndex.execute({
      blockNumber,
      transactionIndex,
    }),
    args.db.$prepared.getBlockByNumber.execute({ blockNumber }),
  ])
  if (!tx[0] || !block[0]) return null
  return decodeTransaction(tx[0], args.config.chainId, block[0])
}
