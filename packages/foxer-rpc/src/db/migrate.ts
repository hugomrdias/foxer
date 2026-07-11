import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator'

import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import type { DatabaseContext } from './client.ts'

/**
 * Applies the package's shipped Drizzle migrations to the active database.
 *
 * Unlike `foxer`, this does not check logical WAL or create publications because
 * `foxer-rpc` has no SQL-over-HTTP live-query replication feature.
 */
export async function runMigrations({
  dbContext,
  folder,
  logger,
}: {
  dbContext: DatabaseContext
  folder: string
  logger: Logger
}) {
  const endClock = startClock()

  await migratePostgres(dbContext.db, { migrationsFolder: folder })

  logger.info({ duration: endClock() }, 'migrations applied')
}
