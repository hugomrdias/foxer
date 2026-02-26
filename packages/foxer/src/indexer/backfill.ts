import { filterContracts, type InternalConfig } from '../config/config.ts'
import type { Env } from '../config/env.ts'
import type { Database } from '../db/client.ts'
import type { relations, schema } from '../db/schema/index.ts'
import { withTransaction } from '../db/transaction.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import { getBlocksInRange } from './cache.ts'
import { windowEnd } from './cursor.ts'
import { getLogsInRange } from './logs.ts'
import { processBlock } from './process-block.ts'

/**
 * Executes historical catch-up from the current cursor to the safe head.
 */
export async function runBackfill(args: {
  env: Env
  logger: Logger
  config: InternalConfig
  db: Database<typeof schema, typeof relations>
  registry: HookRegistry
}): Promise<bigint> {
  const endClock = startClock()
  const { env, db, registry, config, logger } = args
  const client = config.clients.backfill
  const chainHead = await client.getBlockNumber()
  const safeHead =
    chainHead > BigInt(env.CONFIRMATION_DEPTH)
      ? chainHead - BigInt(env.CONFIRMATION_DEPTH)
      : 0n
  let cursor = config.startBlockNumber

  if (cursor > safeHead) {
    logger.debug(
      {
        cursor: cursor.toString(),
        backfillHead: safeHead.toString(),
        head: chainHead.toString(),
      },
      'no historical catch-up needed'
    )
    return cursor
  }

  const batchSize = BigInt(env.BATCH_SIZE)
  const dbBatchSize = BigInt(env.BACKFILL_DB_BATCH_SIZE)
  logger.debug(
    {
      fromBlock: cursor.toString(),
      toBlock: safeHead.toString(),
      batchSize: batchSize.toString(),
      dbBatchSize: dbBatchSize.toString(),
    },
    'starting backfill'
  )

  while (cursor <= safeHead) {
    const batchStartMs = Date.now()
    const toBlock = windowEnd(cursor, batchSize, safeHead)
    const windowContracts = filterContracts(config, cursor, toBlock)

    logger.debug(
      {
        batchFromBlock: cursor.toString(),
        batchToBlock: toBlock.toString(),
        streamCount: windowContracts.addresses.length,
      },
      'processing backfill batch'
    )
    const batchBlockNumbers: bigint[] = []
    let blockNumber = cursor
    while (blockNumber <= toBlock) {
      batchBlockNumbers.push(blockNumber)
      blockNumber += 1n
    }

    const [blocksByNumber, logsByBlock] = await Promise.all([
      getBlocksInRange(logger, db, batchBlockNumbers, client),
      getLogsInRange({
        logger,
        client,
        addresses: windowContracts.addresses,
        events: windowContracts.eventAbis,
        fromBlock: cursor,
        toBlock,
      }),
    ])

    let processedInBatch = 0n
    let nullRoundsInBatch = 0
    let blockIndex = 0
    while (blockIndex < batchBlockNumbers.length) {
      const txWindowEndIndex = Math.min(
        blockIndex + Number(dbBatchSize),
        batchBlockNumbers.length
      )
      await withTransaction(db, async (tx) => {
        while (blockIndex < txWindowEndIndex) {
          const block = batchBlockNumbers[blockIndex]
          if (block == null) {
            blockIndex += 1
            continue
          }
          const prefetchedBlock = blocksByNumber.get(block)
          if (!prefetchedBlock) {
            nullRoundsInBatch += 1
            logger.debug(
              { blockNumber: block.toString() },
              'skipping null round block'
            )
            blockIndex += 1
            continue
          }

          const result = await processBlock({
            logger,
            config,
            db: tx,
            client,
            registry,
            blockNumber: block,
            prefetchedLogs: logsByBlock.get(block) ?? [],
            prefetchedBlock,
            skipParentContinuityCheck: true,
            disableTransaction: true,
            filteredContracts: windowContracts,
          })
          if (result.status === 'processed') {
            processedInBatch += 1n
            // logger.debug(
            //   {
            //     blockNumber: block.toString(),
            //     batchFromBlock: cursor.toString(),
            //     batchToBlock: toBlock.toString(),
            //     processedInBatch: processedInBatch.toString(),
            //   },
            //   'processed backfill block'
            // )
          }
          blockIndex += 1
        }
      })
    }
    const batchElapsedMs = Date.now() - batchStartMs
    const blocksInRange = Number(toBlock - cursor + 1n)
    const blocksPerSecond =
      batchElapsedMs > 0
        ? blocksInRange / (batchElapsedMs / 1000)
        : blocksInRange
    logger.info(
      {
        indexedUpTo: toBlock.toString(),
        nulls: nullRoundsInBatch,
        duration: batchElapsedMs,
        throughput: Number(blocksPerSecond.toFixed(2)),
      },
      'backfill batch completed'
    )
    cursor = toBlock + 1n
  }

  logger.info(
    { duration: endClock(), blocks: cursor - config.startBlockNumber },
    'backfill completed'
  )
  return cursor
}
