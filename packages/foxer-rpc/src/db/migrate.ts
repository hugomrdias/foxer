import { migrate as migratePostgres } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'

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

  if (dbContext.driver === 'postgres') {
    await migratePostgres(dbContext.db as never, { migrationsFolder: folder })
  } else {
    await migratePglite(dbContext.db as never, { migrationsFolder: folder })
  }

  logger.info(
    { driver: dbContext.driver, duration: endClock() },
    'migrations applied'
  )
}
