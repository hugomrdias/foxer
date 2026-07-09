import { hexToBytes } from '../../../utils/hex.ts'
import { getTransactionByBlockNumberAndIndex } from '../transaction.ts'
import type { MethodContext } from '../types.ts'
import { requireHex } from '../validation.ts'

/**
 * Implements `eth_getTransactionByBlockHashAndIndex`.
 */
export async function ethGetTransactionByBlockHashAndIndex(
  args: MethodContext,
  params: unknown[]
) {
  const hash = requireHex(params[0], 'block hash', 32)
  const block = (
    await args.db.$prepared.getBlockByHash.execute({ hash: hexToBytes(hash) })
  )[0]
  if (!block) return null
  return getTransactionByBlockNumberAndIndex(args, block.number, params[1])
}
