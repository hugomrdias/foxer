import {
  foreignKey,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
} from 'drizzle-orm/pg-core'
import type { AccessList } from 'viem'
import { address, bigint, hash, hex, numeric78 } from '../column-types.ts'
import { blocks } from './blocks.ts'

export const transactionTypeEnum = pgEnum('transaction_type', [
  'legacy',
  'eip1559',
  'eip2930',
  'eip4844',
  'eip7702',
])

export const transactions = pgTable(
  'transactions',
  {
    hash: hash().primaryKey(),
    blockNumber: bigint().notNull(),
    transactionIndex: integer().notNull(),
    blockHash: hash().notNull(),
    from: address().notNull(),
    to: address(),
    input: hex().notNull(),
    value: numeric78().notNull(),
    nonce: integer().notNull(),
    r: hash().notNull(),
    s: hash().notNull(),
    v: numeric78().notNull(),
    type: transactionTypeEnum().notNull(),
    gas: numeric78().notNull(),
    gasPrice: numeric78(),
    maxFeePerGas: numeric78(),
    maxPriorityFeePerGas: numeric78(),
    accessList: jsonb().$type<AccessList>(),
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
