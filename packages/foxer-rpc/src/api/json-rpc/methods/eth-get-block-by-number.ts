import { decodeBlock } from '../../decode.ts'
import type { MethodContext } from '../types.ts'
import { resolveBlockNumber } from '../validation.ts'

/**
 * Implements `eth_getBlockByNumber` from database rows.
 */
export async function ethGetBlockByNumber(
  args: MethodContext,
  params: unknown[]
) {
  const blockNumber = await resolveBlockNumber(args, params[0])
  if (blockNumber == null) return null
  const block = (
    await args.db.$prepared.getBlockByNumber.execute({ blockNumber })
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
