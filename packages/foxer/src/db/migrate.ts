import { migrate as migratePostgresJs } from 'drizzle-orm/node-postgres/migrator'
import { getTableConfig, type PgTable } from 'drizzle-orm/pg-core'
import { IndexedColumn } from 'drizzle-orm/pg-core/columns/common'
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator'

import { FOXER_TABLES, PUBLICATION_NAME } from '../contants.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import type { Database, DatabaseContext } from './client.ts'

/**
 * Applies pending SQL migrations at runtime.
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
  // apply migrations
  if (driver === 'postgres') {
    // check if wal is enabled
    const wal = await isWalEnabled(db)
    if (!wal) {
      throw new Error(
        'WAL is not enabled, set wal_level=logical in your postgresql.conf or pass -c wal_level=logical to the postgres client'
      )
    }
    await migratePostgresJs(db, { migrationsFolder: folder })
  } else {
    await migratePglite(db, { migrationsFolder: folder })
  }

  // get tables to migrate
  const tables = Object.keys(dbContext.db._.fullSchema).filter(
    (table) => !FOXER_TABLES.includes(table)
  )
  // assert tables have blockNumber column and index
  // assertTablesHaveBlockNumberIndex(dbContext.db._.fullSchema, tables)

  // create publications
  await createPublications(db, tables)

  logger.info({ driver, duration: endClock() }, 'migrations applied')
}

/**
 * Creates or updates a publication for the provided tables in the database.
 * The resulting publication contains only the provided tables.
 * This is needed for the live sync to work.
 *
 * @param db - The database to create the publication for
 * @param tables - The list of table names to include
 */
export async function createPublications(db: Database, tables: string[]) {
  if (tables.length === 0) return

  const quotedTables = tables.map((table) => `"${table.replaceAll('"', '""')}"`)
  const publication = await db.execute(
    `SELECT puballtables FROM pg_publication WHERE pubname = '${PUBLICATION_NAME}'`
  )

  if (publication.rows.length === 0) {
    await db.execute(
      `CREATE PUBLICATION ${PUBLICATION_NAME} FOR TABLE ${quotedTables.join(', ')}`
    )
    return
  }

  const isForAllTables = Boolean(publication.rows[0].puballtables)
  if (isForAllTables) {
    await db.execute(`DROP PUBLICATION ${PUBLICATION_NAME}`)
    await db.execute(
      `CREATE PUBLICATION ${PUBLICATION_NAME} FOR TABLE ${quotedTables.join(', ')}`
    )
    return
  }

  await db.execute(
    `ALTER PUBLICATION ${PUBLICATION_NAME} SET TABLE ${quotedTables.join(', ')}`
  )
}

/**
 * Ensures every provided table has a blockNumber column and an index on it.
 */
export function assertTablesHaveBlockNumberIndex(
  fullSchema: Record<string, unknown>,
  tableNames: string[]
) {
  const missingBlockNumberColumn: string[] = []
  const missingBlockNumberIndex: string[] = []
  const tableConfigs = new Map<string, ReturnType<typeof getTableConfig>>()
  const tableHasBlockNumberColumn = new Map<string, boolean>()

  for (const tableName of tableNames) {
    const table = fullSchema[tableName]
    if (!table) continue

    const config = getTableConfig(table as PgTable)
    tableConfigs.set(tableName, config)
    tableHasBlockNumberColumn.set(
      tableName,
      config.columns.some((column) =>
        ['blockNumber', 'block_number'].includes(column.name)
      )
    )
  }

  for (const tableName of tableNames) {
    const config = tableConfigs.get(tableName)
    if (!config) continue
    const blockNumberColumns = config.columns.filter((column) =>
      ['blockNumber', 'block_number'].includes(column.name)
    )

    if (blockNumberColumns.length === 0) {
      if (
        hasCascadeForeignKeyToBlockNumberTable(
          config,
          tableHasBlockNumberColumn
        )
      ) {
        continue
      }
      missingBlockNumberColumn.push(tableName)
      continue
    }

    const blockNumberColumnNames = new Set(
      blockNumberColumns.map((column) => column.name)
    )
    const hasBlockNumberIndex = config.indexes.some((index) => {
      const indexColumns = index.config?.columns

      if (!indexColumns || indexColumns.length === 0) return false
      return indexColumns.some((column) => {
        if (!(column instanceof IndexedColumn)) return false
        if (!column.name) return false
        return blockNumberColumnNames.has(column.name)
      })
    })

    if (!hasBlockNumberIndex) {
      missingBlockNumberIndex.push(tableName)
    }
  }

  if (
    missingBlockNumberColumn.length > 0 ||
    missingBlockNumberIndex.length > 0
  ) {
    const missingColumnTables = missingBlockNumberColumn.sort()
    const missingIndexTables = missingBlockNumberIndex.sort()
    const lines = [
      'Invalid schema for Foxer sync.',
      '',
      'Each published table must have:',
      "1) a 'blockNumber' column (db name can be 'block_number')",
      "2) an index that includes 'blockNumber'",
      "Exception: table can skip both when it has a foreign key with onDelete('cascade') to a table with blockNumber.",
      '',
    ]

    if (missingColumnTables.length > 0) {
      lines.push(
        `Tables missing blockNumber column: ${missingColumnTables.join(', ')}`
      )
    }
    if (missingIndexTables.length > 0) {
      lines.push(
        `Tables missing blockNumber index: ${missingIndexTables.join(', ')}`
      )
    }

    lines.push(
      '',
      'Drizzle example:',
      "const myTable = pgTable('my_table', {",
      '  // 1) Add the blockNumber column',
      '  blockNumber: bigint().notNull(),',
      '  // ...other columns',
      '}, (table) => [',
      '  // 2) Add an index on blockNumber',
      "  index('my_table_block_number_index').on(table.blockNumber),",
      '])'
    )

    throw new Error(lines.join('\n'))
  }
}

function hasCascadeForeignKeyToBlockNumberTable(
  tableConfig: ReturnType<typeof getTableConfig>,
  tableHasBlockNumberColumn: Map<string, boolean>
) {
  return tableConfig.foreignKeys.some((foreignKey) => {
    if (foreignKey.onDelete !== 'cascade') return false

    const referencedTable = foreignKey.reference().foreignTable
    const referencedTableName = getTableConfig(referencedTable).name
    return tableHasBlockNumberColumn.get(referencedTableName) === true
  })
}

/**
 * Checks if WAL is enabled.
 *
 * @param db - The database to check
 * @returns True if WAL is enabled, false otherwise
 */
export async function isWalEnabled(db: Database) {
  try {
    const wal = await db
      .execute('SHOW WAL_LEVEL')
      .then((result) => result.rows[0].wal_level)
    return wal === 'logical'
  } catch (error) {
    throw new Error('Failed to check if WAL is enabled', { cause: error })
  }
}
