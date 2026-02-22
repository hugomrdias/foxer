/** biome-ignore-all lint/complexity/noBannedTypes: need it */
import type { AbiEvent } from 'abitype'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { AnyRelations, EmptyRelations } from 'drizzle-orm/relations'
import type { Hono } from 'hono'
import type { BlankEnv, BlankSchema } from 'hono/types'
import {
  type Address,
  getAbiItem,
  type Hex,
  type Narrow,
  toEventSelector,
  toEventSignature,
} from 'viem'
import type { HookRegistry } from '../hooks/registry'
import type {
  ContractsConfig,
  InternalConfig,
  MergedContractEvents,
} from '../utils/types'

export function createConfig<
  contracts extends ContractsConfig<{}> = {},
  TSchema extends Record<string, unknown> = Record<string, never>,
  TRelations extends AnyRelations = EmptyRelations,
>(config: {
  contracts: ContractsConfig<Narrow<contracts>>
  app: Hono<BlankEnv, BlankSchema, '/'>
  schema: TSchema
  relations?: TRelations
  hooks: (context: {
    db: NodePgDatabase<TSchema, TRelations>
    schema: TSchema
    registry: HookRegistry<ContractsConfig<Narrow<contracts>>>
  }) => void
}) {
  const eventNames = []
  const eventAbis: AbiEvent[] = []
  const eventSignatures = []
  const eventSelectors: Hex[] = []
  const addresses: Address[] = []
  const contractNameByAddress: Record<Address, string> = {}
  for (const [contractName, contract] of Object.entries(config.contracts)) {
    contractNameByAddress[contract.address] = contractName
    addresses.push(contract.address)

    for (const event of contract.events) {
      eventNames.push(`${contractName}:${event}`)
      const eventAbi = getAbiItem({
        abi: contract.abi,
        name: event,
      })
      if (!eventAbi) {
        throw new Error(`Event ${event} not found in contract ${contractName}`)
      }
      eventAbis.push(eventAbi as AbiEvent)
      eventSignatures.push(toEventSignature(eventAbi as AbiEvent))
      eventSelectors.push(toEventSelector(eventAbi as AbiEvent))
    }
  }

  return {
    ...config,
    eventNames: eventNames as MergedContractEvents<
      ContractsConfig<Narrow<contracts>>
    >[],
    eventSignatures: eventSignatures,
    eventSelectors: eventSelectors,
    eventAbis: eventAbis,
    addresses: addresses,
    contractNameByAddress: contractNameByAddress,
  }
}

export function filterContracts(
  config: InternalConfig,
  fromBlock: bigint,
  toBlock: bigint
) {
  const eventAbis: AbiEvent[] = []
  const addresses: Address[] = []
  for (const [contractName, contract] of Object.entries(config.contracts)) {
    if (contract.startBlock ?? 0n > toBlock) {
      continue
    }
    if (contract.endBlock != null && contract.endBlock < fromBlock) {
      continue
    }

    addresses.push(contract.address)

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
  }
}
