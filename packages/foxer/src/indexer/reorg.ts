import { gte } from 'drizzle-orm'
import type { PublicClient } from 'viem'
import type { Database } from '../db/client.ts'
import { schema } from '../db/schema/index.ts'
import { safeGetBlock } from '../rpc/block-fetcher.ts'
import type { EncodedBlockWithTransactions } from '../types'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import { hashEquals } from './hash.ts'
import { getBlockByIdOrLatest } from './state.ts'

/**
 * Deletes canonical block rows from a specific block onward.
 */
async function deleteBlocksFrom(
  db: Database,
  fromBlock: bigint
): Promise<void> {
  await db.delete(schema.blocks).where(gte(schema.blocks.number, fromBlock))
}

/**
 * Verifies parent-hash continuity and rolls back divergent canonical rows if needed.
 * Returns the rewind start block when a reorg is detected.
 */
export async function ensureParentContinuity(args: {
  logger: Logger
  db: Database
  client: PublicClient
  block: EncodedBlockWithTransactions
}): Promise<bigint | null> {
  const { logger, db, client, block } = args
  if (block.number === 0n) return null

  // get the previous block
  const previous = await getBlockByIdOrLatest({
    db,
    blockNumber: block.number - 1n,
  })
  if (!previous) return null

  // check if the previous block's hash is the same as the block's parent hash
  if (hashEquals(previous.blockHash, block.parentHash)) {
    return null
  }

  logger.warn(
    { blockNumber: block.number.toString() },
    'parent mismatch detected; rolling back'
  )

  // Walk backward from the immediate parent of the failing block until we find
  // a block number where DB and chain hashes agree again.
  let cursor = block.number - 1n

  console.log('🚀 ~ ensureParentContinuity ~ cursor:', cursor)

  while (true) {
    // 1) Read the DB's canonical block at this height.
    const dbBlock = await getBlockByIdOrLatest({ db, blockNumber: cursor })
    if (!dbBlock) {
      // Missing DB row at this height: keep scanning backward.
      // If even genesis is missing, drop everything and replay from 0.
      // if (cursor === 0n) {
      //   await deleteBlocksFrom(db, 0n)
      //   return 0n
      // }
      cursor -= 1n
      continue
    }

    // 2) Read chain block at the same height.
    const blockResult = await safeGetBlock(client, cursor)
    if (blockResult.status === 'null_round') {
      // Chain has no stable block here yet; move backward.
      // If this happens at genesis, safest fallback is full reset.
      // if (cursor === 0n) {
      //   await deleteBlocksFrom(db, 0n)
      //   return 0n
      // }
      cursor -= 1n
      continue
    }
    const chainBlock = blockResult.block
    const chainHash = chainBlock.hash?.toLowerCase()
    if (chainHash && hashEquals(chainHash, dbBlock.blockHash)) {
      // 3) Found the last common ancestor. Rewind to the first divergent height.
      // If mismatch was detected exactly at the current parent boundary,
      // rewind one extra block to avoid re-processing the same block in a loop.
      const rewindTo = cursor
      await deleteBlocksFrom(db, rewindTo)
      return rewindTo
    }

    // 4) Still divergent at this height; keep scanning backward.
    // If we reach genesis with no match, reset everything.
    if (cursor === 0n) {
      await deleteBlocksFrom(db, 0n)
      return 0n
    }
    cursor -= 1n
  }
}

/**
 * Validates recent indexed blocks against chain state on startup.
 */
export async function verifyRecentBlocks(args: {
  logger: Logger
  db: Database
  client: PublicClient
  depth: number
}): Promise<void> {
  const { logger, db, client, depth } = args
  const endClock = startClock()
  const latest = (await getBlockByIdOrLatest({ db }))?.blockNumber ?? null
  if (latest == null) return

  const start = latest - BigInt(depth) >= 0n ? latest - BigInt(depth) : 0n
  let blockNumber = start
  while (blockNumber <= latest) {
    const dbBlock = await getBlockByIdOrLatest({ db, blockNumber })
    if (!dbBlock) {
      blockNumber += 1n
      continue
    }
    const blockResult = await safeGetBlock(client, blockNumber)
    if (blockResult.status === 'null_round') {
      logger.warn(
        { blockNumber: blockNumber.toString() },
        'startup sanity check hit null round'
      )
      await deleteBlocksFrom(db, blockNumber)
      return
    }
    const chainBlock = blockResult.block
    const chainHash = chainBlock.hash?.toLowerCase()
    if (!chainHash || !hashEquals(chainHash, dbBlock.blockHash)) {
      logger.warn(
        { blockNumber: blockNumber.toString() },
        'startup sanity check mismatch detected'
      )
      await deleteBlocksFrom(db, blockNumber)
      return
    }
    blockNumber += 1n
  }
  logger.info({ duration: endClock() }, 'startup sanity check completed')
}
