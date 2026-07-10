import { sql } from 'drizzle-orm'

import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import type { Database } from './client.ts'

export const MANAGED_BACKFILL_INDEXES = [
  'blocks_hash_index',
  'logs_address_block_number_index',
  'logs_topic0_block_number_index',
] as const

export type ManagedBackfillIndex = (typeof MANAGED_BACKFILL_INDEXES)[number]

const INDEX_DEFINITIONS: Record<ManagedBackfillIndex, string> = {
  blocks_hash_index:
    'CREATE INDEX IF NOT EXISTS "blocks_hash_index" ON "blocks" ("hash")',
  logs_address_block_number_index:
    'CREATE INDEX IF NOT EXISTS "logs_address_block_number_index" ON "logs" ("address","block_number")',
  logs_topic0_block_number_index:
    'CREATE INDEX IF NOT EXISTS "logs_topic0_block_number_index" ON "logs" ("topic0","block_number")',
}

/**
 * Normalizes Drizzle's array and node-postgres result shapes into row arrays.
 */
function queryRows<T extends Record<string, unknown>>(
  result: { rows?: T[] } | T[]
): T[] {
  return Array.isArray(result) ? result : (result.rows ?? [])
}

/**
 * Reports whether each secondary index managed by backfill deferral exists.
 */
export async function getManagedIndexState(
  db: Database
): Promise<Record<ManagedBackfillIndex, boolean>> {
  const result = await db.execute<{ indexname: string }>(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname IN (${sql.join(
        MANAGED_BACKFILL_INDEXES.map((name) => sql`${name}`),
        sql`, `
      )})
  `)

  const existing = new Set(queryRows(result).map((row) => row.indexname))

  return Object.fromEntries(
    MANAGED_BACKFILL_INDEXES.map((name) => [name, existing.has(name)])
  ) as Record<ManagedBackfillIndex, boolean>
}

/**
 * Returns true when every deferred secondary index is currently available.
 */
export async function managedIndexesExist(db: Database): Promise<boolean> {
  const state = await getManagedIndexState(db)
  return MANAGED_BACKFILL_INDEXES.every((name) => state[name])
}

/**
 * Returns true when startup must recover at least one deferred index.
 */
export async function anyManagedIndexMissing(db: Database): Promise<boolean> {
  return !(await managedIndexesExist(db))
}

/**
 * Drops non-constraint indexes that are expensive to maintain during backfill.
 *
 * Primary keys and the transaction-position unique index remain in place so
 * inserts retain their conflict handling and integrity guarantees.
 */
export async function dropManagedBackfillIndexes(args: {
  db: Database
  logger: Logger
}): Promise<void> {
  const endClock = startClock()
  const stateBefore = await getManagedIndexState(args.db)

  for (const indexName of MANAGED_BACKFILL_INDEXES) {
    await args.db.execute(
      sql.raw(`DROP INDEX IF EXISTS "${indexName.replaceAll('"', '""')}"`)
    )
  }

  const stateAfter = await getManagedIndexState(args.db)
  args.logger.info(
    {
      duration: endClock(),
      indexesBefore: stateBefore,
      indexesAfter: stateAfter,
    },
    'dropped managed backfill indexes'
  )
}

/**
 * Recreates deferred indexes and refreshes planner statistics after backfill.
 *
 * Index creation is idempotent so this also repairs interrupted backfills that
 * left only a subset of the managed indexes available.
 */
export async function restoreManagedBackfillIndexes(args: {
  db: Database
  logger: Logger
}): Promise<void> {
  const endClock = startClock()
  const stateBefore = await getManagedIndexState(args.db)

  for (const indexName of MANAGED_BACKFILL_INDEXES) {
    await args.db.execute(sql.raw(INDEX_DEFINITIONS[indexName]))
  }

  const analyzeClock = startClock()
  await args.db.execute(sql`ANALYZE "blocks"`)
  await args.db.execute(sql`ANALYZE "logs"`)

  const stateAfter = await getManagedIndexState(args.db)
  args.logger.info(
    {
      duration: endClock(),
      analyzeDuration: analyzeClock(),
      indexesBefore: stateBefore,
      indexesAfter: stateAfter,
    },
    'restored managed backfill indexes'
  )
}
