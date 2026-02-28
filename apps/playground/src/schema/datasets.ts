import { foreignKey, json, pgTable } from 'drizzle-orm/pg-core'
import { address, bigint, schema } from 'foxer'

export const datasets = pgTable(
  'datasets',
  {
    dataSetId: bigint().primaryKey(),
    providerId: bigint().notNull(),
    pdpRailId: bigint().notNull(),
    cacheMissRailId: bigint().notNull(),
    cdnRailId: bigint().notNull(),
    payer: address().notNull(),
    serviceProvider: address().notNull(),
    payee: address().notNull(),
    metadata: json().$type<Record<string, unknown>>(),
    blockNumber: bigint().notNull(),
    listenerAddr: address(),
    createdAt: bigint(),
    updatedAt: bigint(),
  },
  (table) => [
    foreignKey({
      columns: [table.blockNumber],
      foreignColumns: [schema.blocks.number],
      name: 'datasets_block_fk',
    }).onDelete('cascade'),
  ]
)

// {
//   dataSetId: bigint
//   providerId: bigint
//   pdpRailId: bigint
//   cacheMissRailId: bigint
//   cdnRailId: bigint
//   payer: `0x${string}`
//   serviceProvider: `0x${string}`
//   payee: `0x${string}`
//   metadataKeys: readonly
//   string[];
//   metadataValues: readonly
//   string[];
// }
