import path from 'node:path'
import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'

import { createComponentLogger } from '../logger.ts'
import type { DatabaseContext } from './client.ts'

const log = createComponentLogger('migrations')

/**
 * Applies pending SQL migrations at runtime (Option 4 strategy).
 */
export async function runMigrations({
  dbContext,
  drizzleFolder,
}: {
  drizzleFolder: string
  dbContext: DatabaseContext
}): Promise<void> {
  const { db, driver } = dbContext
  const migrationsFolder = path.resolve(process.cwd(), drizzleFolder)
  if (driver === 'postgres') {
    await migrateNodePg(db, { migrationsFolder })
  } else {
    await migratePglite(db, { migrationsFolder })
  }
  log.info({ driver }, 'migrations applied')
}
