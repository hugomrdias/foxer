import {
  bigint,
  foreignKey,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core'

import { schema } from 'foxer'

export const pieces = pgTable(
  'pieces',
  {
    id: bigint('id', { mode: 'bigint' }).notNull(),
    datasetId: bigint('dataset_id', { mode: 'bigint' }).notNull(),
    address: text('address').notNull(),
    cid: text('cid').notNull(),
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
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
