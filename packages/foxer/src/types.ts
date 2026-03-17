import type { Simplify } from 'type-fest'
import type { Block, Transaction } from 'viem'

import type { Schema } from './db/schema/index'
/**
 * Generic result with error
 */
export type MaybeResult<ResultType = unknown, ErrorType = Error> =
  | {
      error: ErrorType
      result?: undefined
    }
  | {
      result: ResultType
      error?: undefined
    }

export type UnknownObject = NonNullable<unknown>

export type ChainTransaction = Transaction<bigint, number, false>
export type ChainBlock = Block<
  bigint,
  true,
  'latest' | 'safe' | 'finalized',
  ChainTransaction
>
export type EncodedBlock = Schema['blocks']['$inferInsert']
export type EncodedTransaction = Schema['transactions']['$inferInsert']
export type EncodedBlockWithTransactions = Simplify<
  EncodedBlock & {
    transactions: EncodedTransaction[]
  }
>
export type TransactionsMap = Map<`0x${string}`, EncodedTransaction>
export type BlocksMap = Map<bigint, EncodedBlock>
