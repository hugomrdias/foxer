import type { InternalConfig } from '../config.ts'
import { insertIndexedBlockData } from '../db/actions.ts'
import {
  anyManagedIndexMissing,
  dropManagedBackfillIndexes,
  restoreManagedBackfillIndexes,
} from '../db/backfill-indexes.ts'
import type { Database } from '../db/client.ts'
import { safeGetBlock } from '../rpc/get-block.ts'
import type { EncodedBlock, EncodedLog, EncodedTransaction } from '../types.ts'
import { windowEnd } from '../utils/cursor.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'

/**
 * Runs the historical catch-up phase up to the chain's safe head.
 *
 * The cursor is derived from the latest persisted block, so restarts continue
 * from the next missing height instead of replaying already-indexed history.
 * The returned cursor is the first block live sync should queue.
 */
export async function runBackfill(args: {
  logger: Logger
  config: InternalConfig
  db: Database
}): Promise<bigint> {
  const endClock = startClock()
  const { db, config, logger } = args
  const client = config.clients.backfill
  const chainHead = await client.getBlockNumber()
  const safeHead =
    chainHead > config.finality ? chainHead - config.finality : 0n
  const latest =
    (await db.$prepared.getLatestBlock.execute())[0]?.number ?? null
  const nextBlock = latest == null ? null : latest + 1n
  let cursor =
    nextBlock == null || config.startBlock > nextBlock
      ? config.startBlock
      : nextBlock

  const needsWork = cursor <= safeHead
  const deferIndexes = config.deferBackfillIndexes
  const deferIndexesForBackfill = deferIndexes && needsWork

  if (!deferIndexesForBackfill && (await anyManagedIndexMissing(db))) {
    await restoreManagedBackfillIndexes({ db, logger })
  }

  if (!needsWork) {
    logger.info(
      {
        cursor: cursor.toString(),
        backfillHead: safeHead.toString(),
        head: chainHead.toString(),
      },
      'no historical catch-up needed'
    )
    return cursor
  }

  logger.info(
    {
      fromBlock: cursor.toString(),
      toBlock: safeHead.toString(),
      batchSize: config.batchSize.toString(),
      deferBackfillIndexes: deferIndexes,
    },
    'starting backfill'
  )

  try {
    if (deferIndexesForBackfill) {
      await dropManagedBackfillIndexes({ db, logger })
    }

    while (cursor <= safeHead) {
      const batchStartMs = Date.now()
      const toBlock = windowEnd(cursor, config.batchSize, safeHead)
      const batch: bigint[] = []
      let blockNumber = cursor
      while (blockNumber <= toBlock) {
        batch.push(blockNumber)
        blockNumber += 1n
      }

      const indexedBlocks = await Promise.all(
        batch.map((blockNumber) => safeGetBlock({ client, blockNumber, db }))
      )

      const blocks: EncodedBlock[] = []
      const transactions: EncodedTransaction[] = []
      const logs: EncodedLog[] = []

      for (const item of indexedBlocks) {
        blocks.push(item.block)
        transactions.push(...item.transactions)
        logs.push(...item.logs)
      }

      logger.debug(
        {
          blocks: blocks.length,
          transactions: transactions.length,
          logs: logs.length,
        },
        'indexed block data'
      )
      await insertIndexedBlockData({ db, blocks, transactions, logs })

      const elapsed = Date.now() - batchStartMs
      const blocksInRange = Number(toBlock - cursor + 1n)
      const throughput =
        elapsed > 0 ? blocksInRange / (elapsed / 1000) : blocksInRange
      logger.info(
        {
          indexedUpTo: toBlock.toString(),
          duration: elapsed,
          throughput: Number(throughput.toFixed(2)),
        },
        'backfill batch completed'
      )

      cursor = toBlock + 1n
    }

    logger.info({ duration: endClock() }, 'backfill completed')
    return cursor
  } finally {
    if (deferIndexesForBackfill) {
      await restoreManagedBackfillIndexes({ db, logger })
    }
  }
}
