import { getTransactionByBlockNumberAndIndex } from '../transaction.ts'
import type { MethodContext } from '../types.ts'
import { resolveBlockNumber } from '../validation.ts'

/**
 * Implements `eth_getTransactionByBlockNumberAndIndex`.
 */
export async function ethGetTransactionByBlockNumberAndIndex(
  args: MethodContext,
  params: unknown[]
) {
  const blockNumber = await resolveBlockNumber(args, params[0])
  if (blockNumber == null) return null
  return getTransactionByBlockNumberAndIndex(args, blockNumber, params[1])
}
