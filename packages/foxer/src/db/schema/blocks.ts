import { pgTable } from 'drizzle-orm/pg-core'
import { address, bigint, bytea, hash, numeric78 } from '../column-types.ts'

export const blocks = pgTable('blocks', {
  number: bigint().notNull().primaryKey(),
  timestamp: bigint().notNull(),
  hash: hash().notNull(),
  parentHash: hash().notNull(),
  logsBloom: bytea().notNull(),
  miner: address().notNull(),
  gasUsed: numeric78().notNull(),
  gasLimit: numeric78().notNull(),
  baseFeePerGas: numeric78(),
  nonce: bytea().notNull(),
  mixHash: bytea().notNull(),
  stateRoot: bytea().notNull(),
  receiptsRoot: bytea().notNull(),
  transactionsRoot: bytea().notNull(),
  sha3Uncles: bytea().notNull(),
  size: numeric78().notNull(),
  difficulty: numeric78().notNull(),
  totalDifficulty: numeric78(),
  extraData: bytea().notNull(),
})
