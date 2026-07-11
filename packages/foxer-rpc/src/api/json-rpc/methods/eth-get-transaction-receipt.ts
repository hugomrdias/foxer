import type { Database } from '../../../db/client.ts'
import { hexToBytes } from '../../../utils/hex.ts'
import { decodeReceipt } from '../../decode.ts'
import { requireHex } from '../validation.ts'

/**
 * Implements `eth_getTransactionReceipt`.
 */
export async function ethGetTransactionReceipt(
  db: Database,
  params: unknown[]
) {
  const hash = requireHex(params[0], 'transaction hash', 32)
  const tx = (
    await db.$prepared.getReceiptTransactionByHash.execute({
      hash: hexToBytes(hash),
    })
  )[0]
  if (!tx) return null
  const [block, logs] = await Promise.all([
    db.$prepared.getBlockByNumber.execute({ blockNumber: tx.blockNumber }),
    db.$prepared.getLogsByTransactionPosition.execute({
      blockNumber: tx.blockNumber,
      transactionIndex: tx.transactionIndex,
    }),
  ])
  if (!block[0]) return null
  return decodeReceipt(tx, block[0], logs)
}
