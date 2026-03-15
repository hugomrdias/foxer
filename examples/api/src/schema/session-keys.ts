import { address, bigint, hash } from '@hugomrdias/foxer'
import {
  foreignKey,
  index,
  pgTable,
  primaryKey,
  text,
} from 'drizzle-orm/pg-core'

export const sessionKeys = pgTable(
  'sessionKeys',
  {
    signer: address().notNull().primaryKey(),
    identity: address().notNull(),
    origin: text().notNull(),
    blockNumber: bigint().notNull(),
    createdAt: bigint(),
    updatedAt: bigint(),
  },
  (table) => [
    index('sessionKeys_identity_index').on(table.identity),
    index('sessionKeys_block_number_index').on(table.blockNumber),
  ]
)

export const sessionKeyPermissions = pgTable(
  'sessionKeyPermissions',
  {
    signer: address().notNull(),
    permission: hash().notNull(),
    expiry: bigint(),
  },
  (table) => [
    primaryKey({ columns: [table.signer, table.permission] }),
    foreignKey({
      columns: [table.signer],
      foreignColumns: [sessionKeys.signer],
      name: 'sessionKeyPermissions_signer_fk',
    }).onDelete('cascade'),
  ]
)
