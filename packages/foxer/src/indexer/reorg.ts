import type { PublicClient } from 'viem'

import { deleteBlocksFrom } from '../db/actions/blocks.ts'
import type { Database } from '../db/client.ts'
import { safeGetBlock } from '../rpc/get-block.ts'
import type { EncodedBlockWithTransactions } from '../types'
import { hashEquals } from '../utils/hash.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'

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
  const previous = (
    await db.$prepared.getBlockById.execute({
      db,
      blockNumber: block.number - 1n,
    })
  )[0]
  if (!previous) return null

  // check if the previous block's hash is the same as the block's parent hash
  if (hashEquals(previous.hash, block.parentHash)) {
    return null
  }

  logger.warn({ blockNumber: block.number.toString() }, 'parent mismatch detected; rolling back')

  // Walk backward from the immediate parent of the failing block until we find
  // a block number where DB and chain hashes agree again.
  let cursor = block.number - 1n

  while (true) {
    // 1) Read the DB's canonical block at this height.
    const dbBlock = (await db.$prepared.getBlockById.execute({ blockNumber: cursor }))[0]
    if (!dbBlock) {
      cursor -= 1n
      continue
    }

    // 2) Read chain block at the same height.
    const chainBlock = await safeGetBlock({ client, blockNumber: cursor, db })
    // if (blockResult.status === 'null_round') {
    //   cursor -= 1n
    //   continue
    // }

    // 3) Found the last common ancestor. Rewind to the first divergent height.
    if (hashEquals(chainBlock.hash, dbBlock.hash)) {
      const rewindTo = cursor
      await deleteBlocksFrom(db, rewindTo)
      return rewindTo
    }

    // 4) Still divergent at this height; keep scanning backward.
    // TODO This should finality depth and it should delete and throw critical error
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
  depth: bigint
}): Promise<void> {
  const { logger, db, client, depth } = args
  const endClock = startClock()
  const latest = (await db.$prepared.getLatestBlock.execute())[0]?.number ?? null

  if (latest == null) return

  const start = latest - depth >= 0n ? latest - depth : 0n
  let blockNumber = start
  while (blockNumber <= latest) {
    const dbBlock = (await db.$prepared.getBlockById.execute({ blockNumber }))[0]

    if (!dbBlock) {
      blockNumber += 1n
      continue
    }
    const chainBlock = await safeGetBlock({ client, blockNumber, db })

    if (!hashEquals(chainBlock.hash, dbBlock.hash)) {
      logger.warn({ blockNumber: blockNumber.toString() }, 'startup sanity check mismatch detected')
      await deleteBlocksFrom(db, blockNumber)
      return
    }
    blockNumber += 1n
  }
  logger.info({ duration: endClock() }, 'startup sanity check completed')
}
