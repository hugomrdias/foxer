import { desc, eq } from 'drizzle-orm'

import type { Database } from '../db/client.ts'
import { schema } from '../db/schema/index.ts'

/**
 * Returns a canonical block row by number, or the latest row when no block number is provided.
 */
export async function getBlockByIdOrLatest(args: {
  db: Database
  blockNumber?: bigint
}): Promise<{
  blockNumber: bigint
  blockHash: string
  parentHash: string
} | null> {
  const { db, blockNumber } = args
  const rows = await db
    .select({
      blockNumber: schema.blocks.number,
      blockHash: schema.blocks.hash,
      parentHash: schema.blocks.parentHash,
    })
    .from(schema.blocks)
    .where(
      blockNumber == null ? undefined : eq(schema.blocks.number, blockNumber)
    )
    .orderBy(desc(schema.blocks.number))
    .limit(1)
  return rows[0] ?? null
}
