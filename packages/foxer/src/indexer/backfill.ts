import type { PublicClient } from 'viem'
import { filterContracts } from '../config/config.ts'
import { env } from '../config/env.ts'
import type { Database } from '../db/client.ts'
import { withTransaction } from '../db/transaction.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import { createComponentLogger } from '../logger.ts'
import type { InternalConfig } from '../utils/types.ts'
import { getBlocksInRange } from './cache.ts'
import { windowEnd } from './cursor.ts'
import { getLogsInRange } from './logs.ts'
import { processBlock } from './process-block.ts'

const log = createComponentLogger('backfill')

/**
 * Executes historical catch-up from the current cursor to the safe head.
 */
export async function runBackfill(args: {
  config: InternalConfig
  db: Database
  client: PublicClient
  hooks: HookRegistry
}): Promise<bigint> {
  console.time('runBackfill')
  const { db, client, hooks, config } = args
  const chainHead = await client.getBlockNumber()
  const safeHead =
    chainHead > BigInt(env.CONFIRMATION_DEPTH)
      ? chainHead - BigInt(env.CONFIRMATION_DEPTH)
      : 0n
  let cursor = env.START_BLOCK

  if (cursor > safeHead) {
    log.info(
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
  log.info(
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

    log.debug(
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

    console.time('getBlocksInRange and getLogsInRange')
    const [blocksByNumber, logsByBlock] = await Promise.all([
      getBlocksInRange(db, batchBlockNumbers, client),
      getLogsInRange({
        client,
        addresses: windowContracts.addresses,
        events: windowContracts.eventAbis,
        fromBlock: cursor,
        toBlock,
      }),
    ])
    console.timeEnd('getBlocksInRange and getLogsInRange')
    // console.time('getBlocksInRange')
    // const blocksByNumber = await getBlocksInRange(db, batchBlockNumbers, client)
    // console.timeEnd('getBlocksInRange')

    // console.time('getLogsInRange')
    // const logsByBlock = await getLogsInRange({
    //   client,
    //   addresses: windowContracts.addresses,
    //   events: windowContracts.eventAbis,
    //   fromBlock: cursor,
    //   toBlock,
    // })
    // console.timeEnd('getLogsInRange')

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
            log.debug(
              { blockNumber: block.toString() },
              'skipping null round block'
            )
            blockIndex += 1
            continue
          }

          const result = await processBlock({
            config,
            db: tx,
            client,
            hooks,
            blockNumber: block,
            prefetchedLogs: logsByBlock.get(block) ?? [],
            prefetchedBlock,
            skipParentContinuityCheck: true,
            disableTransaction: true,
          })
          if (result.status === 'processed') {
            processedInBatch += 1n
            log.debug(
              {
                blockNumber: block.toString(),
                batchFromBlock: cursor.toString(),
                batchToBlock: toBlock.toString(),
                processedInBatch: processedInBatch.toString(),
              },
              'processed backfill block'
            )
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
    log.info(
      {
        indexedUpTo: toBlock.toString(),
        processed: processedInBatch.toString(),
        nullRounds: nullRoundsInBatch,
        traversedBlocks: batchBlockNumbers.length,
        throughputBlocksPerSecond: Number(blocksPerSecond.toFixed(2)),
      },
      'backfill batch completed'
    )
    cursor = toBlock + 1n
  }

  console.timeEnd('runBackfill')
  return cursor
}
