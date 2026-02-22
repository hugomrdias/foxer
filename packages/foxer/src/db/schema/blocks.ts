import { pgTable } from 'drizzle-orm/pg-core'
import { address, bigint, hash, hex, numeric78 } from '../column-types.ts'

export const blocks = pgTable('blocks', {
  number: bigint().notNull().primaryKey(),
  timestamp: bigint().notNull(),
  hash: hash().notNull(),
  parentHash: hash().notNull(),
  logsBloom: hex({ length: 514 }).notNull(),
  miner: address().notNull(),
  gasUsed: numeric78().notNull(),
  gasLimit: numeric78().notNull(),
  baseFeePerGas: numeric78(),
  nonce: hex({ length: 18 }).notNull(),
  mixHash: hash().notNull(),
  stateRoot: hash().notNull(),
  receiptsRoot: hash().notNull(),
  transactionsRoot: hash().notNull(),
  sha3Uncles: hash().notNull(),
  size: numeric78().notNull(),
  difficulty: numeric78().notNull(),
  totalDifficulty: numeric78(),
  extraData: hex().notNull(),
})
