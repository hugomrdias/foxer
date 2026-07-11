import { hexToBytes } from '../../../utils/hex.ts'
import { decodeBlock } from '../../decode.ts'
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

  if (params[1]) {
    const rows = await args.db.$prepared.getTransactionsByBlockNumber.execute({
      blockNumber: block.number,
    })
    return decodeBlock(block, { full: true, rows }, args.config.chainId)
  }

  const rows =
    await args.db.$prepared.getTransactionHashesByBlockNumber.execute({
      blockNumber: block.number,
    })
  return decodeBlock(block, { full: false, rows }, args.config.chainId)
}
