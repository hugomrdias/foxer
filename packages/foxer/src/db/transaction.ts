import type { Database } from './client'

/**
 * Runs work in a transaction for either postgres or pglite drivers.
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
