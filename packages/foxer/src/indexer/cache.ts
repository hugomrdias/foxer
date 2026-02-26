/** biome-ignore-all lint/style/noNonNullAssertion: its ok */
import type { PublicClient } from 'viem'
import type { Database } from '../db/client.ts'
import { type relations, schema } from '../db/schema/index.ts'
import { safeGetBlock } from '../rpc/block-fetcher.ts'
import type { EncodedBlockWithTransactions } from '../types.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'

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

export async function getBlocksInRange(
  logger: Logger,
  db: Database<typeof schema, typeof relations>,
  blockNumbers: bigint[],
  client: PublicClient
): Promise<Map<bigint, EncodedBlockWithTransactions>> {
  const endClock = startClock()
  const firstBlockNumber = blockNumbers[0]!
  const lastBlockNumber = blockNumbers[blockNumbers.length - 1]!

  const r = await db.query.blocks.findMany({
    with: {
      transactions: true,
    },
    where: {
      AND: [
        { number: { gte: firstBlockNumber } },
        { number: { lte: lastBlockNumber } },
      ],
    },
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
