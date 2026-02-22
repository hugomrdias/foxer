/** biome-ignore-all lint/complexity/noBannedTypes: need it */
import type { AbiEvent } from 'abitype'
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations'
import type { Hono } from 'hono'
import type { BlankEnv, BlankSchema } from 'hono/types'
import { type Address, getAbiItem, getAddress, type Narrow } from 'viem'
import type { Database } from '../db/client'
import type { HookRegistry } from '../hooks/registry'
import type { ContractsConfig, InternalConfig } from '../utils/types'

export function createConfig<
  contracts extends ContractsConfig<{}> = {},
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
>(config: {
  drizzleFolder: string
  contracts: ContractsConfig<Narrow<contracts>>
  app: ({
    db,
  }: {
    db: Database<TSchema, TRelations>
  }) => Hono<BlankEnv, BlankSchema, '/'>
  schema: TSchema
  relations?: TRelations
  hooks: (context: {
    registry: HookRegistry<
      ContractsConfig<Narrow<contracts>>,
      TSchema,
      TRelations
    >
  }) => void
}) {
  return {
    ...config,
    relations: config.relations ? config.relations : ({} as EmptyRelations),
  }
}

export function filterContracts(
  config: InternalConfig,
  fromBlock: bigint,
  toBlock: bigint
) {
  const eventAbis: AbiEvent[] = []
  const addresses: Address[] = []
  const contractNameByAddress: Record<Address, string> = {}
  for (const [contractName, contract] of Object.entries(config.contracts)) {
    const address = getAddress(contract.address)
    contractNameByAddress[address] = contractName
    if (contract.startBlock ?? 0n > toBlock) {
      continue
    }
    if (contract.endBlock != null && contract.endBlock < fromBlock) {
      continue
    }

    addresses.push(address)

    for (const event of contract.events) {
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
  }
}
