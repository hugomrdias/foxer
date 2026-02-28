import type { PublicClient } from 'viem'
import { encodeBlockWithTransactions } from '../db/encode.ts'
import type { EncodedBlockWithTransactions } from '../types.ts'

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

/**
 * Detects Filecoin null-round RPC errors so callers can skip non-existent rounds.
 */
export function isNullRoundRpcError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  if (message.includes('null round')) {
    return true
  }

  const details = (error as { details?: unknown }).details
  if (
    typeof details === 'string' &&
    details.toLowerCase().includes('null round')
  ) {
    return true
  }

  const cause = (error as { cause?: unknown }).cause
  if (cause && typeof cause === 'object') {
    const causeMessage = (cause as { message?: unknown }).message
    if (
      typeof causeMessage === 'string' &&
      causeMessage.toLowerCase().includes('null round')
    ) {
      return true
    }
  }

  return false
}
