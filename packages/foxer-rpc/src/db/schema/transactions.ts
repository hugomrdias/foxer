import {
  integer,
  jsonb,
  smallint,
  snakeCase,
  uniqueIndex,
} from 'drizzle-orm/pg-core'
import type { AccessList } from 'viem'

import { address, bytea, hash, int8, numeric78 } from '../column-types.ts'

export const transactions = snakeCase.table(
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
    gasPrice: numeric78(),
    maxFeePerGas: numeric78(),
    maxPriorityFeePerGas: numeric78(),
    type: smallint().notNull(),
    v: numeric78(),
    r: bytea(),
    s: bytea(),
    accessList: jsonb().$type<AccessList>(),
    status: integer(),
    receiptGasUsed: int8(),
    cumulativeGasUsed: int8(),
    effectiveGasPrice: numeric78(),
    contractAddress: address(),
    logsBloom: bytea().notNull(),
  },
  (table) => [
    uniqueIndex('transactions_block_number_index_unique').on(
      table.blockNumber,
      table.transactionIndex
    ),
  ]
)
