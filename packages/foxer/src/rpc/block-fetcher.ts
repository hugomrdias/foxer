import type { PublicClient } from 'viem'
import type { BlockSimpleWithTransactions } from '../utils/types.ts'
import { isNullRoundRpcError } from './errors.ts'

export type SafeGetBlockResult =
  | { status: 'ok'; block: BlockSimpleWithTransactions }
  | { status: 'null_round' }

/**
 * Fetches a block while normalizing null-round behavior into an explicit result.
 */
export async function safeGetBlock(
  client: PublicClient,
  blockNumber: bigint
): Promise<SafeGetBlockResult> {
  try {
    const block = await client.getBlock({
      blockNumber,
      includeTransactions: true,
    })

    return {
      status: 'ok',
      block: block as unknown as BlockSimpleWithTransactions,
    }
  } catch (error) {
    if (isNullRoundRpcError(error)) {
      return { status: 'null_round' }
    }
    throw error
  }
}
