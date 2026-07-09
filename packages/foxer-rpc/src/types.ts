import type { Address, Block, Hex, Transaction, TransactionType } from 'viem'

import type { Schema } from './db/schema/index.ts'

export type ChainTransaction = Transaction<bigint, number, false>
export type ChainBlock = Block<
  bigint,
  true,
  'latest' | 'safe' | 'finalized',
  ChainTransaction
>
export type ChainLog = {
  address: Address
  topics: Hex[]
  data: Hex
  blockNumber: bigint
  transactionHash: Hex
  transactionIndex: number
  blockHash: Hex
  logIndex: number
  removed: boolean
}

export type ChainReceipt = {
  transactionHash: Hex
  transactionIndex: number
  blockHash: Hex
  blockNumber: bigint
  from: Address
  to: Address | null
  cumulativeGasUsed: bigint
  gasUsed: bigint
  contractAddress: Address | null
  logs: ChainLog[]
  status: 'success' | 'reverted'
  effectiveGasPrice: bigint
  type: TransactionType | Hex
}

export type EncodedBlock = Schema['blocks']['$inferInsert']
export type EncodedTransaction = Schema['transactions']['$inferInsert']
export type EncodedLog = Schema['logs']['$inferInsert']

export type IndexedBlockData = {
  block: EncodedBlock
  transactions: EncodedTransaction[]
  logs: EncodedLog[]
}
