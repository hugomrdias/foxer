import type { InternalConfig } from '../config.ts'
import {
  anyManagedIndexMissing,
  dropManagedBackfillIndexes,
  restoreManagedBackfillIndexes,
} from '../db/backfill-indexes.ts'
import type { Database } from '../db/client.ts'
import { copyIndexedBlockData } from '../db/copy.ts'
import {
  appendToBackfillBatch,
  createBackfillBatch,
} from '../db/indexed-batch.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import { createOrderedBlockFetcher } from './fetch-blocks.ts'

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
      backfillMemoryLimitMb: config.backfillMemoryLimitBytes / (1024 * 1024),
      deferBackfillIndexes: deferIndexes,
    },
    'starting backfill'
  )

  try {
    if (deferIndexesForBackfill) {
      await dropManagedBackfillIndexes({ db, logger })
    }

    let peakObservedRss = process.memoryUsage.rss()
    const fetcher = createOrderedBlockFetcher({
      client,
      db,
      fromBlock: cursor,
      toBlock: safeHead,
      memoryLimitBytes: config.backfillMemoryLimitBytes,
      onBlockReady: () => {
        peakObservedRss = Math.max(peakObservedRss, process.memoryUsage.rss())
      },
    })

    while (cursor <= safeHead) {
      const batchStartMs = Date.now()
      const fromBlock = cursor
      const batch = createBackfillBatch()

      const fetchClock = startClock()
      while (cursor <= safeHead) {
        const remainingBytes =
          config.backfillMemoryLimitBytes - batch.estimatedBytes
        if (
          batch.items.length > 0 &&
          remainingBytes < fetcher.nextReservationBytes
        ) {
          break
        }

        const weighted = await fetcher.next(batch.estimatedBytes)
        if (!weighted) break
        appendToBackfillBatch(batch, weighted.data, weighted.estimatedBytes)
        cursor = weighted.data.block.number + 1n
        if (batch.estimatedBytes >= config.backfillMemoryLimitBytes) break
      }

      if (batch.items.length === 0) {
        throw new Error(`Backfill fetcher stopped before block ${cursor}`)
      }

      const toBlock = batch.items.at(-1)?.block.number ?? fromBlock
      const blocks = batch.items.length
      const transactions = batch.transactionCount
      const logs = batch.logCount
      const estimatedBytes = batch.estimatedBytes
      const oversizedBlock =
        blocks === 1 && estimatedBytes > config.backfillMemoryLimitBytes
      const memoryBeforeCopy = process.memoryUsage()
      peakObservedRss = Math.max(peakObservedRss, memoryBeforeCopy.rss)
      logger.debug(
        {
          fromBlock: fromBlock.toString(),
          toBlock: toBlock.toString(),
          blocks,
          transactions,
          logs,
          estimatedRetainedBytes: estimatedBytes,
          peakFetchConcurrency: fetcher.peakInFlight,
          peakObservedRss,
          rssBeforeCopy: memoryBeforeCopy.rss,
          heapUsedBeforeCopy: memoryBeforeCopy.heapUsed,
          externalBeforeCopy: memoryBeforeCopy.external,
          arrayBuffersBeforeCopy: memoryBeforeCopy.arrayBuffers,
          oversizedBlock,
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
          estimatedRetainedBytes: estimatedBytes,
          peakFetchConcurrency: fetcher.peakInFlight,
          oversizedBlock,
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
          estimatedRetainedBytes: estimatedBytes,
          blocks,
          transactions,
          logs,
          oversizedBlock,
          peakObservedRss,
          duration: elapsed,
          throughput: Number(throughput.toFixed(2)),
        },
        'backfill batch completed'
      )
    }

    logger.info({ duration: endClock(), peakObservedRss }, 'backfill completed')
    return cursor
  } finally {
    if (deferIndexesForBackfill) {
      await restoreManagedBackfillIndexes({ db, logger })
    }
  }
}
