import type { Database } from './client'
import type { relations, schema } from './schema/index.ts'

/**
 * Runs work in a transaction for either postgres or pglite drivers.
 */
export function withTransaction<T>(
  db: Database<typeof schema, typeof relations>,
  run: (tx: Database<typeof schema, typeof relations>) => Promise<T>
): Promise<T> {
  const executor = db as unknown as Database<
    typeof schema,
    typeof relations
  > & {
    transaction: <R>(
      fn: (tx: Database<typeof schema, typeof relations>) => Promise<R>
    ) => Promise<R>
  }
  return executor.transaction(run)
}
