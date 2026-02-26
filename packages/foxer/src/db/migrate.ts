import path from 'node:path'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'
import { migrate as migratePostgresJs } from 'drizzle-orm/postgres-js/migrator'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import type { DatabaseContext } from './client.ts'

/**
 * Applies pending SQL migrations at runtime (Option 4 strategy).
 */
export async function runMigrations({
  dbContext,
  drizzleFolder,
  logger,
}: {
  drizzleFolder: string
  dbContext: DatabaseContext
  logger: Logger
}): Promise<void> {
  const endClock = startClock()
  const { db, driver } = dbContext
  const migrationsFolder = path.resolve(process.cwd(), drizzleFolder)
  if (driver === 'postgres') {
    await migratePostgresJs(db, { migrationsFolder })
  } else {
    await migratePglite(db, { migrationsFolder })
  }
  logger.info({ driver, duration: endClock() }, 'migrations applied')
}
