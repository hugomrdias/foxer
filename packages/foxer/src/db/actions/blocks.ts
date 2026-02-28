/** biome-ignore-all lint/style/noNonNullAssertion: its ok */

import { gte } from 'drizzle-orm'
import type { PublicClient } from 'viem'
import { safeGetBlock } from '../../rpc/get-block.ts'
import type { EncodedBlockWithTransactions } from '../../types.ts'
import type { Logger } from '../../utils/logger.ts'
import { startClock } from '../../utils/timer.ts'
import type { Database } from '../client.ts'
import { type relations, schema } from '../schema/index.ts'

/**
 * Deletes canonical block rows from a specific block onward.
 */
export async function deleteBlocksFrom(
  db: Database,
  fromBlock: bigint
): Promise<void> {
  await db.delete(schema.blocks).where(gte(schema.blocks.number, fromBlock))
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

  await Promise.all(
    missingBlockNumbers.map(async (blockNumber) => {
      const blockResult = await safeGetBlock(client, blockNumber)
      if (blockResult.status === 'null_round') {
        return
      }
      blocksByNumber.set(blockNumber, blockResult.block)
    })
  )

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
