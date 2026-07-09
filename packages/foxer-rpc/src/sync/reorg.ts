import type { PublicClient } from 'viem'

import { deleteBlocksFrom } from '../db/actions.ts'
import type { Database } from '../db/client.ts'
import { safeGetBlockIdentity } from '../rpc/get-block.ts'
import type { EncodedBlock } from '../types.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'

/**
 * Checks that an incoming live block extends the locally stored parent.
 *
 * On mismatch, the function walks backward until a common ancestor is found,
 * deletes all canonical rows after that ancestor, and returns the first block
 * height that must be reprocessed. A `null` result means no reorg was detected.
 */
export async function ensureParentContinuity(args: {
  logger: Logger
  db: Database
  client: PublicClient
  block: EncodedBlock
}): Promise<bigint | null> {
  const { logger, db, client, block } = args
  if (block.number === 0n) return null

  const previous = (
    await db.$prepared.getBlockByNumber.execute({
      blockNumber: block.number - 1n,
    })
  )[0]
  if (!previous) return null

  if (previous.hash === block.parentHash) return null

  logger.warn(
    { blockNumber: block.number.toString() },
    'parent mismatch detected; rolling back'
  )

  let cursor = block.number - 1n

  while (true) {
    const dbBlock = (
      await db.$prepared.getBlockByNumber.execute({ blockNumber: cursor })
    )[0]

    if (!dbBlock) {
      if (cursor === 0n) {
        await deleteBlocksFrom(db, 0n)
        return 0n
      }
      cursor -= 1n
      continue
    }

    const chainBlock = await safeGetBlockIdentity({
      client,
      blockNumber: cursor,
      db,
    })

    if (chainBlock.hash === dbBlock.hash) {
      const rewindTo = cursor + 1n
      await deleteBlocksFrom(db, rewindTo)
      return rewindTo
    }

    if (cursor === 0n) {
      await deleteBlocksFrom(db, 0n)
      return 0n
    }
    cursor -= 1n
  }
}

/**
 * Verifies the most recent persisted block window against the upstream chain.
 *
 * This startup guard catches reorgs that happened while the process was down.
 * When a mismatch is found, all rows from the divergent block onward are
 * deleted so backfill/live sync can replay canonical data.
 */
export async function verifyRecentBlocks(args: {
  logger: Logger
  db: Database
  client: PublicClient
  depth: bigint
}) {
  const { logger, db, client, depth } = args
  const endClock = startClock()
  const latest =
    (await db.$prepared.getLatestBlock.execute())[0]?.number ?? null

  if (latest == null) return

  const start = latest - depth >= 0n ? latest - depth : 0n
  let blockNumber = start
  while (blockNumber <= latest) {
    const dbBlock = (
      await db.$prepared.getBlockByNumber.execute({ blockNumber })
    )[0]

    if (!dbBlock) {
      blockNumber += 1n
      continue
    }

    const chainBlock = await safeGetBlockIdentity({ client, blockNumber, db })
    if (chainBlock.hash !== dbBlock.hash) {
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
