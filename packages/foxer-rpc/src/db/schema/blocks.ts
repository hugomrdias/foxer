import { boolean, index, snakeCase } from 'drizzle-orm/pg-core'

import { address, bytea, hash, int8 } from '../column-types.ts'

export const blocks = snakeCase.table(
  'blocks',
  {
    number: int8().notNull().primaryKey(),
    hash: hash().notNull(),
    isNullRound: boolean().notNull().default(false),
    parentHash: hash().notNull(),
    timestamp: int8().notNull(),
    miner: address().notNull(),
    gasUsed: int8().notNull(),
    gasLimit: int8().notNull(),
    baseFeePerGas: int8(),
    size: int8().notNull(),
    stateRoot: hash().notNull(),
    receiptsRoot: hash().notNull(),
    transactionsRoot: hash().notNull(),
    extraData: bytea().notNull(),
    logsBloom: bytea().notNull(),
  },
  (table) => [index('blocks_hash_index').on(table.hash)]
)
