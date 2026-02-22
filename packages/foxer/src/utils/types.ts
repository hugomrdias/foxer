import type { Abi, ExtractAbiEvent, ExtractAbiEventNames } from 'abitype'
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations'
import type { Hono } from 'hono'
import type { BlankEnv, BlankSchema } from 'hono/types'
import type { AccessList, Block, Transaction } from 'viem'
import type { Database } from '../db/client'
import type { HookRegistry } from '../hooks/registry'

export type EnsureUniqueTuple<
  tuple extends readonly unknown[],
  seen = never,
> = tuple extends readonly [
  infer head,
  ...infer tail extends readonly unknown[],
]
  ? head extends seen
    ? never
    : readonly [head, ...EnsureUniqueTuple<tail, seen | head>]
  : tuple

export type MergedContractEvents<
  contracts,
  contractName extends keyof contracts & string = keyof contracts & string,
> = {
  [name in contractName]: contracts[name] extends {
    events: readonly (infer eventName extends string)[]
  }
    ? `${name}:${eventName}`
    : never
}[contractName]

export interface ContractConfig<
  abi extends Abi,
  events extends
    readonly ExtractAbiEventNames<abi>[] = readonly ExtractAbiEventNames<abi>[],
> {
  /** Contract application byte interface. */
  abi: abi
  /** Contract address. */
  address: `0x${string}`
  /** Block number at which to start indexing events (inclusive). If `undefined`, events will be processed from block 0. Default: `undefined` */
  startBlock?: bigint
  /** Block number at which to stop indexing events (inclusive). If `undefined`, events will be processed in real-time. Default: `undefined`. */
  endBlock?: bigint
  /** Events to index. No duplicates allowed.*/
  events: EnsureUniqueTuple<events>
}

export type GetContract<contract = unknown> = contract extends {
  abi: infer abi extends Abi
}
  ? contract extends {
      events: infer events extends readonly ExtractAbiEventNames<abi>[]
    }
    ? // 1. Contract has a valid abi and events
      ContractConfig<abi, events>
    : // 2. Contract has a valid abi
      ContractConfig<abi>
  : // 3. Contract has an invalid abi
    ContractConfig<Abi>

export type ContractsConfig<contracts> =
  NonNullable<unknown> extends contracts
    ? // contracts empty, return empty
      NonNullable<unknown>
    : {
        [name in keyof contracts]: GetContract<contracts[name]>
      }

export type InternalConfig<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> = {
  contracts: { [contractName: string]: GetContract }
  drizzleFolder: string
  app: ({
    db,
  }: {
    db: Database<TSchema, TRelations>
  }) => Hono<BlankEnv, BlankSchema, '/'>
  schema: TSchema
  relations: TRelations
  hooks: (context: { registry: HookRegistry }) => void
}

export type EventKey = `${string}:${string}`

export type ContractNameFromEventKey<C extends EventKey> =
  C extends `${infer ContractName}:${string}` ? ContractName : never

export type EventNameFromEventKey<K extends string> =
  K extends `${string}:${infer EventName}` ? EventName : never

export type ContractAbiByEventKey<
  C extends ContractsConfig<NonNullable<unknown>>,
  Event extends EventKey,
> = C[Extract<ContractNameFromEventKey<Event>, keyof C>] extends {
  abi: infer ContractAbi extends Abi
}
  ? ContractAbi
  : Abi

export type ContractAbiEventByEventKey<
  C extends ContractsConfig<NonNullable<unknown>>,
  Event extends EventKey,
> = ExtractAbiEvent<
  ContractAbiByEventKey<C, Event>,
  EventNameFromEventKey<Event>
>

export type BlockWithTransactions<T extends boolean = true> = Block<
  bigint,
  T,
  'latest' | 'finalized'
>

export type TransactionSimple = Omit<
  Transaction<bigint, number, false>,
  | 'yParity'
  | 'gasPrice'
  | 'accessList'
  | 'maxFeePerGas'
  | 'maxPriorityFeePerGas'
> & {
  gasPrice: bigint | null
  accessList: AccessList | null
  maxFeePerGas: bigint | null
  maxPriorityFeePerGas: bigint | null
}

export type BlockSimple = Omit<
  BlockWithTransactions<false>,
  | 'transactions'
  | 'blobGasUsed'
  | 'sealFields'
  | 'withdrawals'
  | 'withdrawalsRoot'
  | 'excessBlobGas'
  | 'uncles'
>

export type BlockSimpleWithTransactions = Omit<
  BlockWithTransactions<false>,
  | 'blobGasUsed'
  | 'sealFields'
  | 'withdrawals'
  | 'withdrawalsRoot'
  | 'excessBlobGas'
  | 'uncles'
  | 'transactions'
> & {
  transactions: TransactionSimple[]
}
