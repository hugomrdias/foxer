import { quantity } from '../../decode.ts'
import type { MethodContext } from '../types.ts'
import { resolveBlockNumber } from '../validation.ts'

/**
 * Implements `eth_getBlockTransactionCountByNumber`.
 */
export async function ethGetBlockTransactionCountByNumber(
  args: MethodContext,
  params: unknown[]
) {
  const blockNumber = await resolveBlockNumber(args, params[0])
  if (blockNumber == null) return null
  const count = (
    await args.db.$prepared.getTransactionCountByBlockNumber.execute({
      blockNumber,
    })
  )[0]?.count
  return quantity(count ?? 0)
}
