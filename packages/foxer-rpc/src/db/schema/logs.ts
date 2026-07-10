import { index, integer, primaryKey, snakeCase } from 'drizzle-orm/pg-core'

import { address, bytea, hash, int8 } from '../column-types.ts'

export const logs = snakeCase.table(
  'logs',
  {
    blockNumber: int8().notNull(),
    logIndex: integer().notNull(),
    transactionIndex: integer().notNull(),
    address: address().notNull(),
    topic0: hash(),
    topic1: hash(),
    topic2: hash(),
    topic3: hash(),
    data: bytea().notNull(),
  },
  (table) => [
    primaryKey({
      columns: [table.blockNumber, table.logIndex],
      name: 'logs_block_number_log_index_pk',
    }),
    index('logs_address_block_number_index').on(
      table.address,
      table.blockNumber
    ),
    index('logs_topic0_block_number_index').on(table.topic0, table.blockNumber),
  ]
)
