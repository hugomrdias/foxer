import {
  bigint,
  customType,
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  varchar,
} from 'drizzle-orm/pg-core'
import type { AccessList, Address, Hash, Hex } from 'viem'
import { blocks } from './blocks.ts'

export const transactionTypeEnum = pgEnum('transaction_type', [
  'legacy',
  'eip1559',
  'eip2930',
  'eip4844',
  'eip7702',
])

const numeric78 = customType<{ data: bigint; driverData: string }>({
  dataType() {
    return 'numeric(78,0)'
  },
  fromDriver(value: string) {
    return BigInt(value)
  },
})

export const transactions = pgTable(
  'transactions',
  {
    hash: varchar('hash', { length: 66 }).primaryKey().$type<Hash>(),
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
    transactionIndex: integer('transaction_index').notNull(),
    blockHash: varchar('block_hash', { length: 66 }).notNull().$type<Hash>(),
    from: varchar('from', { length: 42 }).notNull().$type<Address>(),
    to: varchar('to', { length: 42 }).$type<Address>(),
    input: text('input').notNull().$type<Hex>(),
    value: numeric78('value').notNull(),
    nonce: integer('nonce').notNull(),
    r: varchar('r', { length: 66 }).notNull().$type<Hash>(),
    s: varchar('s', { length: 66 }).notNull().$type<Hash>(),
    v: numeric78('v').notNull(),
    type: transactionTypeEnum('type').notNull(),
    typeHex: varchar('type_hex', { length: 66 }).$type<Hex>(),
    gas: numeric78('gas').notNull(),
    gasPrice: numeric78('gas_price'),
    maxFeePerGas: numeric78('max_fee_per_gas'),
    maxPriorityFeePerGas: numeric78('max_priority_fee_per_gas'),
    accessList: jsonb('access_list').$type<AccessList>(),
  },
  (table) => [
    foreignKey({
      columns: [table.blockNumber],
      foreignColumns: [blocks.number],
      name: 'transactions_block_fk',
    }).onDelete('cascade'),
    index('transactions_block_number_index').on(table.blockNumber),
  ]
)
