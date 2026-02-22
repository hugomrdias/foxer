/** biome-ignore-all lint/style/noNonNullAssertion: its ok */
import type { PublicClient } from 'viem'
import { buildConflictUpdateColumns, type Database } from '../db/client.ts'
import { type relations, schema } from '../db/schema/index.ts'
import { safeGetBlock } from '../rpc/block-fetcher.ts'
import type { BlockSimpleWithTransactions } from '../utils/types.ts'

export async function cacheBlockAndTransactions(args: {
  db: Database
  block: BlockSimpleWithTransactions
}): Promise<void> {
  const { db, block } = args
  const { transactions, ...blockData } = block

  await db
    .insert(schema.blocks)
    .values(blockData)
    .onConflictDoUpdate({
      target: [schema.blocks.number],
      set: blockData,
    })

  if (transactions.length === 0) {
    return
  }

  await db
    .insert(schema.transactions)
    .values(transactions)
    .onConflictDoUpdate({
      target: [schema.transactions.hash],
      set: buildConflictUpdateColumns(schema.transactions),
    })
}

export async function getBlocksInRange(
  db: Database<typeof schema, typeof relations>,
  blockNumbers: bigint[],
  client: PublicClient
): Promise<Map<bigint, BlockSimpleWithTransactions>> {
  console.time('getBlocksInRange')

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

  const blocksByNumber = new Map<bigint, BlockSimpleWithTransactions>()
  const missing = new Set(blockNumbers)

  for (const block of r) {
    blocksByNumber.set(block.number, block)
    missing.delete(block.number)
  }

  const missingBlockNumbers = [...missing]

  if (missingBlockNumbers.length > 0) {
    console.warn(`Missing blocks:${missingBlockNumbers.length}`)
  }

  await Promise.all(
    missingBlockNumbers.map(async (blockNumber) => {
      const blockResult = await safeGetBlock(client, blockNumber)
      if (blockResult.status === 'null_round') {
        return
      }
      blocksByNumber.set(blockNumber, blockResult.block)
    })
  )
  console.timeEnd('getBlocksInRange')
  return blocksByNumber
}
