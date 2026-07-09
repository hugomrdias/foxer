import type { Database } from '../../../db/client.ts'
import { hexToBytes } from '../../../utils/hex.ts'
import { quantity } from '../../decode.ts'
import { requireHex } from '../validation.ts'

/**
 * Implements `eth_getBlockTransactionCountByHash`.
 */
export async function ethGetBlockTransactionCountByHash(
  db: Database,
  params: unknown[]
) {
  const hash = requireHex(params[0], 'block hash', 32)
  const block = (
    await db.$prepared.getBlockByHash.execute({ hash: hexToBytes(hash) })
  )[0]
  if (!block) return null
  const count = (
    await db.$prepared.getTransactionCountByBlockNumber.execute({
      blockNumber: block.number,
    })
  )[0]?.count
  return quantity(count ?? 0)
}
