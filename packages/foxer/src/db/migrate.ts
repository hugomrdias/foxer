import { DrizzleQueryError } from 'drizzle-orm'
import { migrate as migratePostgresJs } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import type { Database, DatabaseContext } from './client.ts'

/**
 * Applies pending SQL migrations at runtime (Option 4 strategy).
 */
export async function runMigrations({
  dbContext,
  folder,
  logger,
}: {
  folder: string
  dbContext: DatabaseContext
  logger: Logger
}): Promise<void> {
  const endClock = startClock()
  const { db, driver } = dbContext
  if (driver === 'postgres') {
    await migratePostgresJs(db, { migrationsFolder: folder })
  } else {
    await migratePglite(db, { migrationsFolder: folder })
  }

  // create publication for all tables
  // this is needed for the live sync to work
  // TODO create publication only for tables that are used in the api
  // check wal is enabled
  // const result = await options.db.execute('SELECT * FROM pg_stat_replication')
  // if (result.rows.length === 0) {
  //   throw new Error('WAL is not enabled')
  // }
  await createPublication(db)
  logger.info({ driver, duration: endClock() }, 'migrations applied')
}

/**
 * Creates a publication for all tables in the database.
 * This is needed for the live sync to work.
 *
 * @param db - The database to create the publication for
 * @returns The publication name
 */
export async function createPublication(db: Database) {
  try {
    await db.execute('CREATE PUBLICATION alltables FOR ALL TABLES')
  } catch (error) {
    if (
      error instanceof DrizzleQueryError &&
      error.cause?.message.includes('publication "alltables" already exists')
    ) {
      return
    }
    throw error
  }
}
