import type { PublicClient } from 'viem'
import { encodeBlockWithTransactions } from '../db/encode.ts'
import type { EncodedBlockWithTransactions } from '../types'
import { isNullRoundRpcError } from './errors.ts'

export type SafeGetBlockResult =
  | {
      status: 'ok'
      block: EncodedBlockWithTransactions
    }
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
      block: encodeBlockWithTransactions(block),
    }
  } catch (error) {
    if (isNullRoundRpcError(error)) {
      return { status: 'null_round' }
    }
    throw error
  }
}
