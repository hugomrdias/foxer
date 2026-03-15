import type { Abi, AbiEvent } from 'abitype'
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations'
import type { Hono } from 'hono'
import type { BlankEnv, BlankSchema } from 'hono/types'
import type { PoolConfig } from 'pg'
import type { SetRequired, Simplify, UnknownRecord } from 'type-fest'
import {
  type Address,
  type FallbackTransport,
  getAbiItem,
  type HttpTransport,
  type Narrow,
  type PublicClientConfig,
  type WebSocketTransport,
} from 'viem'

import type { Database } from '../db/client.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import { createRpcClients, type RpcClients } from '../rpc/client.ts'
import type { UnknownObject } from '../types.ts'
import type { Logger } from '../utils/logger.ts'
import type {
  ContractConfig,
  ContractsConfig,
  GetContract,
} from '../utils/types.ts'

export type ClientConfig = Simplify<
  SetRequired<PublicClientConfig, 'chain'> & {
    realtimeTransport?: HttpTransport | WebSocketTransport | FallbackTransport
  }
>

export type HonoConfig<
  TSchema extends UnknownRecord = UnknownRecord,
  TRelations extends AnyRelations = EmptyRelations,
> = (options: {
  logger: Logger
  db: Database<TSchema, TRelations>
}) => Hono<BlankEnv, BlankSchema, '/'>

export type HooksConfig<
  contracts extends ContractsConfig<UnknownObject>,
  TSchema extends UnknownRecord,
  TRelations extends AnyRelations,
> = (context: {
  registry: HookRegistry<
    ContractsConfig<Narrow<contracts>>,
    TSchema,
    TRelations
  >
}) => void

export type DatabaseConfig =
  | {
      driver: 'postgres'
      url?: string
      options?: PoolConfig
    }
  | {
      driver: 'pglite'
      directory: string
    }

export type Config<
  contracts extends ContractsConfig<UnknownObject>,
  TSchema extends UnknownRecord,
  TRelations extends AnyRelations = EmptyRelations,
> = {
  /**
   * The batch size for the backfill. How many blocks to process at a time.
   * @default 100
   */
  batchSize?: number
  /**
   * The finality of the chain.
   * @default 30
   */
  finality?: number
  /**
   * The folder where the drizzle schema is stored.
   * @default './drizzle'
   */
  drizzleFolder?: string
  /**
   * The database configuration.
   */
  database?: DatabaseConfig
  /**
   * The contracts to index.
   */
  contracts: ContractsConfig<Narrow<contracts>>
  /**
   * The RPC clients configuration.
   */
  client: ClientConfig
  /**
   * The Hono configuration.
   */
  hono: HonoConfig<TSchema, TRelations>
  /**
   * The drizzle schema.
   */
  schema: TSchema
  /**
   * The drizzle relations.
   */
  relations?: TRelations
  /**
   * The hooks configuration.
   */
  hooks: HooksConfig<contracts, TSchema, TRelations>
}

export type InternalConfig<
  TSchema extends UnknownRecord = UnknownRecord,
  TRelations extends AnyRelations = EmptyRelations,
> = {
  batchSize: bigint
  finality: bigint
  drizzleFolder: string
  contracts: { [contractName: string]: GetContract }
  database?: DatabaseConfig
  client: ClientConfig
  hono: HonoConfig<TSchema, TRelations>
  schema: TSchema
  relations: TRelations
  hooks: (context: { registry: HookRegistry }) => void
  startBlockNumber: bigint
  contractsForLive: ContractConfig<Abi, readonly string[]>[]
  clients: RpcClients
}

export function createConfig<
  contracts extends ContractsConfig<UnknownObject>,
  TSchema extends UnknownRecord = UnknownRecord,
  TRelations extends AnyRelations = EmptyRelations,
>(config: Config<contracts, TSchema, TRelations>) {
  let startBlockNumber: bigint = 0n
  const contractsForLive: ContractConfig<Abi, readonly string[]>[] = []

  for (const contract of Object.values(
    config.contracts as { [contractName: string]: GetContract }
  )) {
    if (contract.endBlock == null) {
      contractsForLive.push(contract)
    }

    if (startBlockNumber === 0n && contract.startBlock != null) {
      startBlockNumber = contract.startBlock
      continue
    }

    if (contract.startBlock != null && contract.startBlock < startBlockNumber) {
      startBlockNumber = contract.startBlock
    }
  }

  const clients = createRpcClients(config.client)

  return {
    ...config,
    batchSize: BigInt(config.batchSize ?? 100),
    finality: BigInt(config.finality ?? 30),
    drizzleFolder: config.drizzleFolder ?? './drizzle',
    relations: config.relations ? config.relations : ({} as TRelations),
    startBlockNumber,
    contractsForLive,
    clients,
  }
}

export type FilteredContracts = {
  eventAbis: AbiEvent[]
  addresses: Address[]
  eventNames: Set<string>
  contractNameByAddress: Record<Address, string>
}

export function filterContracts(
  config: InternalConfig,
  fromBlock: bigint,
  toBlock: bigint
) {
  const eventAbis: AbiEvent[] = []
  const addresses: Address[] = []
  const eventNames: Set<string> = new Set()
  const contractNameByAddress: Record<Address, string> = {}
  for (const [contractName, contract] of Object.entries(config.contracts)) {
    const address = contract.address.toLowerCase() as `0x${string}`
    const startBlock = contract.startBlock ?? 0n

    if (startBlock > toBlock) {
      continue
    }
    if (contract.endBlock != null && contract.endBlock < fromBlock) {
      continue
    }

    addresses.push(address)
    contractNameByAddress[address] = contractName

    for (const event of contract.events) {
      eventNames.add(event)
      const eventAbi = getAbiItem({
        abi: contract.abi,
        name: event,
      })
      if (!eventAbi) {
        throw new Error(`Event ${event} not found in contract ${contractName}`)
      }
      eventAbis.push(eventAbi as AbiEvent)
    }
  }

  return {
    eventAbis: eventAbis,
    addresses: addresses,
    contractNameByAddress: contractNameByAddress,
    eventNames: eventNames,
  }
}
