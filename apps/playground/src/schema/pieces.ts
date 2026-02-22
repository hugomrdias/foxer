import { foreignKey, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'
import { address, bigint, schema } from 'foxer'

export const pieces = pgTable(
  'pieces',
  {
    id: bigint().notNull(),
    datasetId: bigint().notNull(),
    address: address().notNull(),
    cid: text('cid').notNull(),
    blockNumber: bigint().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.datasetId, table.id] }),
    foreignKey({
      columns: [table.blockNumber],
      foreignColumns: [schema.blocks.number],
      name: 'datasets_block_fk',
    }).onDelete('cascade'),
  ]
)
