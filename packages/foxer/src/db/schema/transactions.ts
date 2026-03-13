import { index, integer, jsonb, pgEnum, pgTable } from 'drizzle-orm/pg-core'
import type { AccessList } from 'viem'

import { address, bigint, bytea, hash, numeric78 } from '../column-types.ts'

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
    input: bytea().notNull(),
    value: numeric78().notNull(),
    nonce: integer().notNull(),
    r: bytea().notNull(),
    s: bytea().notNull(),
    v: numeric78().notNull(),
    type: transactionTypeEnum().notNull(),
    gas: numeric78().notNull(),
    gasPrice: numeric78(),
    maxFeePerGas: numeric78(),
    maxPriorityFeePerGas: numeric78(),
    accessList: jsonb().$type<AccessList>(),
  },
  (table) => [
    index('transactions_block_number_index').on(table.blockNumber),
    index('transactions_to_index').on(table.to),
  ],
)
