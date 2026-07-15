import type { Block, Transaction } from 'viem'

import type { Schema } from './db/schema/index.ts'

export type ChainTransaction = Transaction<bigint, number, false>
export type ChainBlock = Block<
  bigint,
  true,
  'latest' | 'safe' | 'finalized',
  ChainTransaction
>
export type EncodedBlock = Schema['blocks']['$inferInsert']
export type EncodedTransaction = Schema['transactions']['$inferInsert']
export type EncodedLog = Schema['logs']['$inferInsert']

export type IndexedBlockData = {
  block: EncodedBlock
  transactions: EncodedTransaction[]
  logs: EncodedLog[]
}
