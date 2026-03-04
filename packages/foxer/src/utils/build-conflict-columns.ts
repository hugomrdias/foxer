import { type SQL, sql } from 'drizzle-orm'
import type { PgTable } from 'drizzle-orm/pg-core'
import { getColumns } from 'drizzle-orm/utils'
import { snakeCase } from 'scule'

export const buildConflictUpdateColumns = <
  T extends PgTable,
  Q extends keyof T['_']['columns'],
>(
  table: T,
  columns?: Q[]
) => {
  const cls = getColumns(table)
  const cols = columns ?? (Object.keys(cls) as Q[])
  const r = cols.reduce(
    (acc, column) => {
      const colName = snakeCase(cls[column].name)

      acc[column] = sql.raw(`excluded.${colName}`)
      return acc
    },
    {} as Record<Q, SQL>
  )

  return r
}
