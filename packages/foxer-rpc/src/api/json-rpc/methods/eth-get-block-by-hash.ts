import { hexToBytes } from '../../../utils/hex.ts'
import { decodeBlockByRow } from '../block.ts'
import type { MethodContext } from '../types.ts'
import { requireHex } from '../validation.ts'

/**
 * Implements `eth_getBlockByHash` from database rows.
 */
export async function ethGetBlockByHash(
  args: MethodContext,
  params: unknown[]
) {
  const hash = requireHex(params[0], 'block hash', 32)
  const block = (
    await args.db.$prepared.getBlockByHash.execute({ hash: hexToBytes(hash) })
  )[0]
  if (!block) return null
  return decodeBlockByRow(args, block, Boolean(params[1]))
}
