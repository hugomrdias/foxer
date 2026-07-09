import { decodeBlockByRow } from '../block.ts'
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
  return decodeBlockByRow(args, block, Boolean(params[1]))
}
