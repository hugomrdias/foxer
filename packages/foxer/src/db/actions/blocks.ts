/** biome-ignore-all lint/style/noNonNullAssertion: its ok */

import { gte } from 'drizzle-orm'
import type { PublicClient } from 'viem'
import { safeGetBlock } from '../../rpc/get-block.ts'
import type {
  EncodedBlockWithTransactions,
  EncodedTransaction,
} from '../../types.ts'
import type { Logger } from '../../utils/logger.ts'
import { startClock } from '../../utils/timer.ts'
import type { Database } from '../client.ts'
import { type relations, schema } from '../schema/index.ts'

/**
 * Deletes canonical block rows from a specific block onward.
 * TODO: go over all the user schemas check tables with blockNumber and delete from there too
 */
export async function deleteBlocksFrom(
  db: Database,
  fromBlock: bigint
): Promise<void> {
  await db.transaction(async (tx) => {
    await Promise.all([
      tx.delete(schema.blocks).where(gte(schema.blocks.number, fromBlock)),
      tx
        .delete(schema.transactions)
        .where(gte(schema.transactions.blockNumber, fromBlock)),
    ])
  })
}

/**
 * Caches a block and its transactions in the database.
 *
 * @param args - The arguments for the function
 * @param args.db - The database instance
 * @param args.block - The block to cache
 * @returns The cached block and transactions
 */
export async function cacheBlockAndTransactions(args: {
  db: Database
  block: EncodedBlockWithTransactions
}): Promise<void> {
  const { db, block } = args

  await db
    .insert(schema.blocks)
    .values(block)
    .onConflictDoNothing({
      target: [schema.blocks.number],
    })

  if (block.transactions.length === 0) {
    return
  }

  await db
    .insert(schema.transactions)
    .values(block.transactions)
    .onConflictDoNothing({
      target: [schema.transactions.hash],
    })
}

/**
 * Gets blocks and their transactions from the database in a range.
 *
 * @param args - The arguments for the function
 * @param args.logger - The logger instance
 * @param args.db - The database instance
 * @param args.blockNumbers - The block numbers to get
 * @param args.client - The client instance
 * @returns The blocks and their transactions
 */
export async function getBlocksInRange(
  logger: Logger,
  db: Database<typeof schema, typeof relations>,
  blockNumbers: bigint[],
  client: PublicClient
): Promise<Map<bigint, EncodedBlockWithTransactions>> {
  const endClock = startClock()
  const firstBlockNumber = blockNumbers[0]!
  const lastBlockNumber = blockNumbers[blockNumbers.length - 1]!

  const r = await db.$prepared.getBlocksInRange.execute({
    firstBlockNumber,
    lastBlockNumber,
  })

  const blocksByNumber = new Map<bigint, EncodedBlockWithTransactions>()
  const missing = new Set(blockNumbers)

  for (const block of r) {
    blocksByNumber.set(block.number, block)
    missing.delete(block.number)
  }

  const missingBlockNumbers = [...missing]
  const newBlocks: EncodedBlockWithTransactions[] = []
  const newTransactions: EncodedTransaction[] = []

  await Promise.all(
    missingBlockNumbers.map(async (blockNumber) => {
      const blockResult = await safeGetBlock({ client, blockNumber, db })
      const transactions = blockResult.transactions
      blocksByNumber.set(blockNumber, blockResult)
      newBlocks.push(blockResult)
      if (transactions.length > 0) {
        newTransactions.push(...transactions)
      }
    })
  )

  if (newBlocks.length > 0) {
    await db
      .insert(schema.blocks)
      .values(newBlocks)
      .onConflictDoNothing({
        target: [schema.blocks.number],
      })
    if (newTransactions.length > 0) {
      await insertTransactionsInChunks({
        db,
        transactions: newTransactions,
        logger,
      })
    }
  }

  logger.info(
    {
      blocks: blocksByNumber.size,
      missing: missingBlockNumbers.length,
      duration: endClock(),
    },
    'get blocks'
  )
  return blocksByNumber
}
const TRANSACTION_INSERT_CHUNK_SIZE = 400
async function insertTransactionsInChunks(args: {
  db: Database
  transactions: EncodedTransaction[]
  logger?: Logger
}): Promise<void> {
  const { db, transactions, logger } = args
  if (transactions.length === 0) {
    return
  }

  for (
    let chunkStart = 0;
    chunkStart < transactions.length;
    chunkStart += TRANSACTION_INSERT_CHUNK_SIZE
  ) {
    const chunkEnd = Math.min(
      chunkStart + TRANSACTION_INSERT_CHUNK_SIZE,
      transactions.length
    )
    const chunk = transactions.slice(chunkStart, chunkEnd)

    try {
      await db
        .insert(schema.transactions)
        .values(chunk)
        .onConflictDoNothing({
          target: [schema.transactions.hash],
        })
    } catch (error) {
      if (logger) {
        logger.error(
          {
            chunkSize: chunk.length,
            chunkStart,
            chunkEnd: chunkEnd - 1,
            firstBlockNumber: chunk[0]?.blockNumber.toString(),
            lastBlockNumber: chunk[chunk.length - 1]?.blockNumber.toString(),
          },
          'failed to insert transaction chunk'
        )
      }
      throw error
    }
  }
}
