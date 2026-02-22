import { bigint, foreignKey, json, pgTable, text } from 'drizzle-orm/pg-core'
import { schema } from 'foxer'

export const datasets = pgTable(
  'datasets',
  {
    id: bigint('id', { mode: 'bigint' }).primaryKey(),
    providerId: bigint('provider_id', { mode: 'bigint' }).notNull(),
    pdpRailId: bigint({ mode: 'bigint' }),
    cdnRailId: bigint({ mode: 'bigint' }),
    cacheMissRailId: bigint({ mode: 'bigint' }),
    payee: text('payee'),
    storageProvider: text('storage_provider'),
    address: text('account_address').notNull(),
    metadata: json('metadata').$type<Record<string, unknown>>(),
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
  },
  (table) => [
    foreignKey({
      columns: [table.blockNumber],
      foreignColumns: [schema.blocks.number],
      name: 'datasets_block_fk',
    }).onDelete('cascade'),
  ]
)
