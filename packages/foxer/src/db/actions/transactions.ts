import type { PgAsyncTransaction, PgQueryResultHKT } from 'drizzle-orm/pg-core'
import { MAX_QUERY_PARAMS } from '../../contants.ts'
import type { EncodedTransaction } from '../../types.ts'
import { schema } from '../schema/index.ts'

/**
 * Inserts transactions in chunks to avoid query parameter limit.
 */
export async function insertTransactionsInChunks(args: {
  db: PgAsyncTransaction<PgQueryResultHKT, typeof schema>
  transactions: EncodedTransaction[]
}): Promise<void> {
  const { db, transactions } = args
  if (transactions.length === 0) {
    return
  }

  const batchSize = Math.floor(
    MAX_QUERY_PARAMS / Object.keys(transactions[0]).length
  )

  for (let i = 0; i < transactions.length; i += batchSize) {
    const chunk = transactions.slice(i, i + batchSize)

    await db
      .insert(schema.transactions)
      .values(chunk)
      .onConflictDoNothing({
        target: [schema.transactions.hash],
      })
  }
}
