import type { InternalConfig } from '../config.ts'
import {
  anyManagedIndexMissing,
  dropManagedBackfillIndexes,
  restoreManagedBackfillIndexes,
} from '../db/backfill-indexes.ts'
import type { Database } from '../db/client.ts'
import { copyIndexedBlockData } from '../db/copy.ts'
import { countLogs, countTransactions } from '../db/indexed-batch.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import { fetchBlocksInOrder } from './fetch-blocks.ts'

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
      backfillConcurrency: config.backfillConcurrency,
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
      const fromBlock = cursor
      const batchEnd = cursor + BigInt(config.backfillConcurrency) - 1n
      const toBlock = batchEnd < safeHead ? batchEnd : safeHead

      const fetchClock = startClock()
      const batch = await fetchBlocksInOrder({
        client,
        db,
        fromBlock,
        toBlock,
        concurrency: config.backfillConcurrency,
      })
      const blocks = batch.length
      const transactions = countTransactions(batch)
      const logs = countLogs(batch)
      logger.debug(
        {
          fromBlock: fromBlock.toString(),
          toBlock: toBlock.toString(),
          blocks,
          transactions,
          logs,
          duration: fetchClock(),
        },
        'fetched onchain block data'
      )

      const writeClock = startClock()
      const copyMetrics = await copyIndexedBlockData({
        db,
        batch,
      })
      logger.debug(
        {
          blocks,
          transactions,
          logs,
          duration: writeClock(),
          copyBlocks: copyMetrics.blocks,
          copyTransactions: copyMetrics.transactions,
          copyLogs: copyMetrics.logs,
        },
        'wrote indexed block data'
      )

      const elapsed = Date.now() - batchStartMs
      const blocksInRange = Number(toBlock - fromBlock + 1n)
      const throughput =
        elapsed > 0 ? blocksInRange / (elapsed / 1000) : blocksInRange
      logger.info(
        {
          indexedUpTo: toBlock.toString(),
          blocks,
          transactions,
          logs,
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
