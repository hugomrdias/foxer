/** biome-ignore-all lint/style/noNonNullAssertion: its ok */

import { gte } from 'drizzle-orm'
import {
  getTableConfig,
  type PgAsyncTransaction,
  type PgColumn,
  type PgQueryResultHKT,
  type PgTable,
} from 'drizzle-orm/pg-core'
import type { PublicClient } from 'viem'
import type { FilteredContracts } from '../../config/config.ts'
import { MAX_QUERY_PARAMS } from '../../contants.ts'
import { safeGetBlock } from '../../rpc/get-block.ts'
import type {
  EncodedBlockWithTransactions,
  EncodedTransaction,
} from '../../types.ts'
import type { Logger } from '../../utils/logger.ts'
import { startClock } from '../../utils/timer.ts'
import type { Database } from '../client.ts'
import { type relations, schema } from '../schema/index.ts'
import { insertTransactionsInChunks } from './transactions.ts'

/**
 * Deletes canonical block rows from a specific block onward.
 */
export async function deleteBlocksFrom(
  db: Database,
  fromBlock: bigint
): Promise<void> {
  const deleteTargets = getTablesWithBlockNumberColumn(
    db._.fullSchema as Record<string, unknown>
  )

  await db.transaction(async (tx) => {
    for (const target of deleteTargets) {
      await tx
        .delete(target.table)
        .where(gte(target.blockNumberColumn, fromBlock))
    }

    // blocks uses `number` instead of blockNumber
    await tx.delete(schema.blocks).where(gte(schema.blocks.number, fromBlock))
  })
}

function getTablesWithBlockNumberColumn(fullSchema: Record<string, unknown>) {
  const targets: Array<{ table: PgTable; blockNumberColumn: PgColumn }> = []

  for (const table of Object.values(fullSchema)) {
    const pgTable = table as PgTable
    const config = getTableConfig(pgTable)
    const blockNumberColumn = config.columns.find((column) =>
      ['blockNumber', 'block_number'].includes(column.name)
    )
    if (!blockNumberColumn) continue

    targets.push({ table: pgTable, blockNumberColumn })
  }

  return targets
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
  db: Database<typeof schema, typeof relations>
  block: EncodedBlockWithTransactions
  logger: Logger
}): Promise<void> {
  const { db, block } = args

  await db.transaction(async (tx) => {
    await insertBlocksInChunks({
      db: tx,
      blocks: [block],
    })
    await insertTransactionsInChunks({
      db: tx,
      transactions: block.transactions,
    })
  })
}

/**
 * Gets blocks and their transactions from the database in a range and fetches missing blocks from the RPC.
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
  client: PublicClient,
  contracts: FilteredContracts
): Promise<Map<bigint, EncodedBlockWithTransactions>> {
  const endClock = startClock()
  const firstBlockNumber = blockNumbers[0]!
  const lastBlockNumber = blockNumbers[blockNumbers.length - 1]!

  // const r = await db.$prepared.getBlocksInRange.execute({
  //   firstBlockNumber,
  //   lastBlockNumber,
  //   contractAddresses: contracts.addresses,
  // })

  const r = await db.query.blocks.findMany({
    with: {
      transactions: {
        where: {
          AND: [
            { blockNumber: { gte: firstBlockNumber } },
            { blockNumber: { lte: lastBlockNumber } },
            {
              to: {
                in: contracts.addresses,
              },
            },
          ],
        },
      },
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
  const newBlocks: EncodedBlockWithTransactions[] = []
  const newTransactions: EncodedTransaction[] = []

  await Promise.all(
    missingBlockNumbers.map(async (blockNumber) => {
      const block = await safeGetBlock({ client, blockNumber, db })
      const transactions = block.transactions
      blocksByNumber.set(blockNumber, block)
      newBlocks.push(block)
      if (transactions.length > 0) {
        newTransactions.push(...transactions)
      }
    })
  )

  await db.transaction(async (tx) => {
    await insertBlocksInChunks({
      db: tx,
      blocks: newBlocks,
    })
    await insertTransactionsInChunks({
      db: tx,
      transactions: newTransactions,
    })
  })

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

/**
 * Inserts blocks in chunks to avoid query parameter limit.
 */
export async function insertBlocksInChunks(args: {
  db: PgAsyncTransaction<PgQueryResultHKT, typeof schema>
  blocks: EncodedBlockWithTransactions[]
}): Promise<void> {
  const { db, blocks } = args
  if (blocks.length === 0) return

  const batchSize = Math.floor(MAX_QUERY_PARAMS / Object.keys(blocks[0]).length)
  for (let i = 0; i < blocks.length; i += batchSize) {
    const chunk = blocks.slice(i, i + batchSize)
    await db
      .insert(schema.blocks)
      .values(chunk)
      .onConflictDoNothing({
        target: [schema.blocks.number],
      })
  }
}
