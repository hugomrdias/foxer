import { bigint, numeric, pgTable, text, varchar } from 'drizzle-orm/pg-core'
import type { Address, Hash, Hex } from 'viem'

export const blocks = pgTable('blocks', {
  number: bigint('number', { mode: 'bigint' }).notNull().primaryKey(),
  timestamp: bigint('timestamp', { mode: 'bigint' }).notNull(),
  hash: varchar('hash', { length: 66 }).notNull().$type<Hash>(),
  parentHash: varchar('parent_hash', { length: 66 }).notNull().$type<Hash>(),
  logsBloom: varchar('logs_bloom', { length: 514 }).notNull().$type<Hex>(),
  miner: varchar('miner', { length: 42 }).notNull().$type<Address>(),
  gasUsed: numeric('gas_used', {
    precision: 78,
    scale: 0,
    mode: 'bigint',
  }).notNull(),
  gasLimit: numeric('gas_limit', {
    precision: 78,
    scale: 0,
    mode: 'bigint',
  }).notNull(),
  baseFeePerGas: numeric('base_fee_per_gas', {
    precision: 78,
    scale: 0,
    mode: 'bigint',
  }),
  nonce: varchar('nonce', { length: 18 }).notNull().$type<Hex>(),
  mixHash: varchar('mix_hash', { length: 66 }).notNull().$type<Hash>(),
  stateRoot: varchar('state_root', { length: 66 }).notNull().$type<Hash>(),
  receiptsRoot: varchar('receipts_root', { length: 66 })
    .notNull()
    .$type<Hash>(),
  transactionsRoot: varchar('transactions_root', { length: 66 })
    .notNull()
    .$type<Hash>(),
  sha3Uncles: varchar('sha3_uncles', { length: 66 }).notNull().$type<Hash>(),
  size: numeric('size', { precision: 78, scale: 0, mode: 'bigint' }).notNull(),
  difficulty: numeric('difficulty', {
    precision: 78,
    scale: 0,
    mode: 'bigint',
  }).notNull(),
  totalDifficulty: numeric('total_difficulty', {
    precision: 78,
    scale: 0,
    mode: 'bigint',
  }),
  extraData: text('extra_data').notNull().$type<Hex>(),
})
