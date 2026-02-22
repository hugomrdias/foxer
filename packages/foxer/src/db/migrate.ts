import { fileURLToPath } from 'node:url'

import { migrate as migrateNodePg } from 'drizzle-orm/node-postgres/migrator'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'

import { createComponentLogger } from '../logger.ts'
import type { DatabaseContext } from './client.ts'

const migrationsFolder = fileURLToPath(
  new URL('../../drizzle', import.meta.url)
)
const log = createComponentLogger('migrations')

/**
 * Applies pending SQL migrations at runtime (Option 4 strategy).
 */
export async function runMigrations({
  dbContext,
}: {
  dbContext: DatabaseContext
}): Promise<void> {
  const { db, driver } = dbContext
  if (driver === 'postgres') {
    await migrateNodePg(db, { migrationsFolder })
  } else {
    await migratePglite(db, { migrationsFolder })
  }
  log.info({ driver }, 'migrations applied')
}
