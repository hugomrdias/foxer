import type { Hash } from 'viem'
import { filterContracts, type InternalConfig } from '../config/config.ts'
import { getBlocksInRange } from '../db/actions/blocks.ts'
import type { Database } from '../db/client.ts'
import type { relations, schema } from '../db/schema/index.ts'
import { withTransaction } from '../db/transaction.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import { getLogsInRange } from '../rpc/get-logs.ts'
import { windowEnd } from '../utils/cursor.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import { processBlock } from './process-block.ts'

/**
 * Executes historical catch-up from the current cursor to the safe head.
 */
export async function runBackfill(args: {
  logger: Logger
  config: InternalConfig
  db: Database<typeof schema, typeof relations>
  registry: HookRegistry
}): Promise<bigint> {
  const endClock = startClock()
  const { db, registry, config, logger } = args
  const client = config.clients.backfill
  const chainHead = await client.getBlockNumber()
  const safeHead =
    chainHead > config.finality ? chainHead - config.finality : 0n
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

  const batchSize = config.batchSize
  logger.info(
    {
      fromBlock: cursor.toString(),
      toBlock: safeHead.toString(),
      batchSize: batchSize.toString(),
    },
    'starting backfill'
  )

  while (cursor <= safeHead) {
    const batchStartMs = Date.now()
    const toBlock = windowEnd(cursor, batchSize, safeHead)
    const windowContracts = filterContracts(config, cursor, toBlock)

    const batchBlockNumbers: bigint[] = []
    let blockNumber = cursor
    while (blockNumber <= toBlock) {
      batchBlockNumbers.push(blockNumber)
      blockNumber += 1n
    }

    const logsByBlock = await getLogsInRange({
      logger,
      client,
      addresses: windowContracts.addresses,
      events: windowContracts.eventAbis,
      fromBlock: cursor,
      toBlock,
    })

    const logsTxsSet = new Set<Hash>()
    for (const logs of logsByBlock.values()) {
      for (const log of logs) {
        logsTxsSet.add(log.transactionHash)
      }
    }

    const { blocks: blocksByNumber, transactions: transactionsMap } =
      await getBlocksInRange(
        logger,
        db,
        batchBlockNumbers,
        client,
        Array.from(logsTxsSet)
      )

    let blockIndex = 0

    const endClockBatch = startClock()
    await withTransaction(db, async (tx) => {
      while (blockIndex < batchBlockNumbers.length) {
        const blockNumber = batchBlockNumbers[blockIndex]
        const prefetchedBlock = blocksByNumber.get(blockNumber)

        if (!prefetchedBlock) {
          throw new Error(`Block ${blockNumber} not found`)
        }

        await processBlock({
          logger,
          config,
          db: tx,
          client,
          registry,
          logs: logsByBlock.get(blockNumber) ?? [],
          block: prefetchedBlock,
          transactionsMap,
          type: 'backfill',
          contracts: windowContracts,
        })
        blockIndex += 1
      }
    })
    logger.debug(
      { duration: endClockBatch() },
      'batch block and events processed'
    )
    const batchElapsedMs = Date.now() - batchStartMs
    const blocksInRange = Number(toBlock - cursor + 1n)
    const blocksPerSecond =
      batchElapsedMs > 0
        ? blocksInRange / (batchElapsedMs / 1000)
        : blocksInRange
    logger.info(
      {
        indexedUpTo: toBlock.toString(),
        duration: batchElapsedMs,
        contracts: windowContracts.addresses.length,
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
