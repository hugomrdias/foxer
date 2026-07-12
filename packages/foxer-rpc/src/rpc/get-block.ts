import type { Hash, PublicClient } from 'viem'

import type { Database } from '../db/client.ts'
import {
  encodeWeightedBlockDataFromRpcReceipts,
  encodeWeightedNullRoundBlock,
} from '../db/encode.ts'
import type { WeightedIndexedBlockData } from '../types.ts'
import { normalizeHex } from '../utils/hex.ts'
import { getEncodedBlockReceipts } from './get-receipts.ts'

export type BlockIdentity = {
  number: bigint
  hash: Hash
  parentHash: Hash
}

/**
 * Fetches and encodes all canonical data for one block height.
 *
 * Normal blocks are fetched with full transactions and enriched with block
 * receipts. Filecoin null-round errors are converted into empty placeholder
 * blocks so the database cursor can remain height-contiguous.
 */
export async function safeGetBlock(options: {
  client: PublicClient
  blockNumber: bigint
  db: Database
}): Promise<WeightedIndexedBlockData> {
  const { client, blockNumber, db } = options
  try {
    const block = await client.getBlock({
      blockNumber,
      includeTransactions: true,
    })

    if (block.transactions.length === 0) {
      return encodeWeightedBlockDataFromRpcReceipts(block, [])
    }

    return getEncodedBlockReceipts({ client, block })
  } catch (error) {
    if (isNullRoundRpcError(error)) {
      let previousBlock:
        | { number: bigint; hash: Hash; parentHash: Hash; timestamp: bigint }
        | undefined

      previousBlock = (
        await db.$prepared.getBlockByNumber.execute({
          blockNumber: blockNumber - 1n,
        })
      )[0]

      let previousBlockNumber = blockNumber - 1n
      while (!previousBlock) {
        try {
          const block = await client.getBlock({
            blockNumber: previousBlockNumber,
          })
          previousBlock = {
            number: block.number,
            hash: normalizeHex(block.hash),
            parentHash: normalizeHex(block.parentHash),
            timestamp: block.timestamp,
          }
        } catch (error) {
          if (isNullRoundRpcError(error)) {
            previousBlockNumber -= 1n
            continue
          }
          throw error
        }
      }

      return encodeWeightedNullRoundBlock({
        number: blockNumber,
        hash: previousBlock.hash,
        timestamp: previousBlock.timestamp,
      })
    }
    throw error
  }
}

/**
 * Fetches only the block identity fields needed by reorg checks.
 *
 * This avoids downloading transactions and receipts when callers only compare
 * hashes. Filecoin null rounds are represented with the previous real hash,
 * matching the placeholder rows written by `safeGetBlock`.
 */
export async function safeGetBlockIdentity(options: {
  client: PublicClient
  blockNumber: bigint
  db: Database
}): Promise<BlockIdentity> {
  const { client, blockNumber, db } = options
  try {
    const block = await client.getBlock({
      blockNumber,
      includeTransactions: false,
    })
    if (!block.hash) {
      throw new Error(`Block ${block.number} has no hash`)
    }
    return {
      number: block.number,
      hash: normalizeHex(block.hash),
      parentHash: normalizeHex(block.parentHash),
    }
  } catch (error) {
    if (isNullRoundRpcError(error)) {
      const previousBlock = await findPreviousBlockIdentity({
        client,
        blockNumber: blockNumber - 1n,
        db,
      })
      return {
        number: blockNumber,
        hash: previousBlock.hash,
        parentHash: previousBlock.hash,
      }
    }
    throw error
  }
}

/**
 * Detects the family of upstream RPC errors used for Filecoin null rounds.
 *
 * Different providers surface the message in different places (`message`,
 * `details`, or nested `cause`), so the predicate checks each common location.
 */
export function isNullRoundRpcError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  if (message.includes('null round')) return true

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

async function findPreviousBlockIdentity(options: {
  client: PublicClient
  blockNumber: bigint
  db: Database
}): Promise<BlockIdentity> {
  let previousBlockNumber = options.blockNumber
  const previousBlock = (
    await options.db.$prepared.getBlockByNumber.execute({
      blockNumber: previousBlockNumber,
    })
  )[0]

  while (!previousBlock) {
    try {
      const block = await options.client.getBlock({
        blockNumber: previousBlockNumber,
        includeTransactions: false,
      })
      if (!block.hash) {
        throw new Error(`Block ${block.number} has no hash`)
      }
      return {
        number: block.number,
        hash: normalizeHex(block.hash),
        parentHash: normalizeHex(block.parentHash),
      }
    } catch (error) {
      if (isNullRoundRpcError(error)) {
        previousBlockNumber -= 1n
        continue
      }
      throw error
    }
  }

  return {
    number: previousBlock.number,
    hash: previousBlock.hash,
    parentHash: previousBlock.parentHash,
  }
}
