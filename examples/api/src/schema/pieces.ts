import { address, bigint } from '@hugomrdias/foxer'
import { index, pgTable, primaryKey, text } from 'drizzle-orm/pg-core'

export const pieces = pgTable(
  'pieces',
  {
    id: bigint().notNull(),
    datasetId: bigint().notNull(),
    address: address().notNull(),
    cid: text('cid').notNull(),
    size: bigint(),
    blockNumber: bigint().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.datasetId, table.id] }),
    index('pieces_block_number_index').on(table.blockNumber),
  ]
)
