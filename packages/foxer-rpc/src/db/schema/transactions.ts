import {
  integer,
  jsonb,
  pgEnum,
  pgTable,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { AccessList } from 'viem'

import { address, bytea, hash, int8, numeric78 } from '../column-types.ts'

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
    blockNumber: int8().notNull(),
    transactionIndex: integer().notNull(),
    from: address().notNull(),
    to: address(),
    input: bytea().notNull(),
    value: numeric78().notNull(),
    nonce: integer().notNull(),
    gas: int8().notNull(),
    gasPrice: int8(),
    maxFeePerGas: int8(),
    maxPriorityFeePerGas: int8(),
    type: transactionTypeEnum().notNull(),
    v: int8(),
    r: bytea(),
    s: bytea(),
    accessList: jsonb().$type<AccessList>(),
    status: integer(),
    receiptGasUsed: int8(),
    cumulativeGasUsed: int8(),
    effectiveGasPrice: int8(),
    contractAddress: address(),
  },
  (table) => [
    uniqueIndex('transactions_block_number_index_unique').on(
      table.blockNumber,
      table.transactionIndex
    ),
  ]
)
