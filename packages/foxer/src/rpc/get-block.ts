import type { Hash, PublicClient } from 'viem'

import type { Database } from '../db/client.ts'
import { encodeBlockWithTransactions, encodeNullRoundBlock } from '../db/encode.ts'
import type { EncodedBlockWithTransactions } from '../types.ts'

/**
 * Fetches a block while normalizing null-round behavior into an explicit result.
 */
export async function safeGetBlock(options: {
  client: PublicClient
  blockNumber: bigint
  db: Database
}): Promise<EncodedBlockWithTransactions> {
  const { client, blockNumber, db } = options
  try {
    const block = await client.getBlock({
      blockNumber,
      includeTransactions: true,
    })

    return encodeBlockWithTransactions(block)
  } catch (error) {
    if (isNullRoundRpcError(error)) {
      let previousBlock: { number: bigint; hash: Hash; parentHash: Hash } | undefined

      previousBlock = (
        await db.$prepared.getBlockById.execute({
          blockNumber: blockNumber - 1n,
        })
      )[0]

      let previousBlockNumber = blockNumber - 1n
      // go to the chain and loop back until a full block is found
      if (!previousBlock) {
        while (!previousBlock) {
          try {
            const block = await client.getBlock({
              blockNumber: previousBlockNumber,
            })
            previousBlock = {
              number: block.number,
              hash: block.hash,
              parentHash: block.parentHash,
            }
          } catch (error) {
            // catched another null round, keep going
            if (isNullRoundRpcError(error)) {
              previousBlockNumber -= 1n
              continue
            }
            throw error
          }
        }
      }
      return encodeNullRoundBlock({
        number: blockNumber,
        hash: previousBlock.hash,
      })
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
  if (typeof details === 'string' && details.toLowerCase().includes('null round')) {
    return true
  }

  const cause = (error as { cause?: unknown }).cause
  if (cause && typeof cause === 'object') {
    const causeMessage = (cause as { message?: unknown }).message
    if (typeof causeMessage === 'string' && causeMessage.toLowerCase().includes('null round')) {
      return true
    }
  }

  return false
}
