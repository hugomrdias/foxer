import type { Database } from './client.ts'

/**
 * Runs work inside a database transaction for either supported Drizzle driver.
 *
 * The local `Database` union hides the exact driver session type, so this helper
 * centralizes the cast needed to expose Drizzle's shared transaction API.
 */
export function withTransaction<T>(
  db: Database,
  run: (tx: Database) => Promise<T>
): Promise<T> {
  const executor = db as Database & {
    transaction: <R>(fn: (tx: Database) => Promise<R>) => Promise<R>
  }
  return executor.transaction(run)
}
