import { calibration } from '@filoz/synapse-core/chains'
import type { Database as FoxerDatabase, HookRegistry } from 'foxer'
import { createConfig } from 'foxer'
import { http, webSocket } from 'viem'
import { buildApp } from './src/app.ts'
import { handleDatasets } from './src/hooks/handle-datasets.ts'
import { handlePieces } from './src/hooks/handle-pieces.ts'
import { handleProviders } from './src/hooks/handle-providers.ts'
import { relations, schema } from './src/schema/index.ts'

const START_BLOCK = 3271094n - 15000n // service provider registry start block

export type Database = FoxerDatabase<typeof schema, typeof relations>

export type Registry = HookRegistry<
  typeof config.contracts,
  typeof config.schema,
  typeof config.relations
>

export const config = createConfig({
  drizzleFolder: './drizzle',
  hono: buildApp,
  hooks: ({ registry }) => {
    handleDatasets(registry)
    handlePieces(registry)
    handleProviders(registry)
  },
  client: {
    // transport: http(
    //   `https://calibration.node.glif.io/archive/lotus/rpc/v1?token=${process.env.RPC_ARCHIVE_TOKEN}`
    // ),
    transport: http(process.env.RPC_URL),
    realtimeTransport: http(process.env.RPC_LIVE_URL),
    chain: calibration,
  },
  contracts: {
    sessionKeyRegistry: {
      address: calibration.contracts.sessionKeyRegistry.address,
      abi: calibration.contracts.sessionKeyRegistry.abi,
      events: ['AuthorizationsUpdated'],
      startBlock: START_BLOCK,
    },
    pdpVerifier: {
      address: calibration.contracts.pdp.address,
      abi: calibration.contracts.pdp.abi,
      events: ['PiecesAdded', 'PiecesRemoved'],
      startBlock: START_BLOCK,
    },
    storage: {
      address: calibration.contracts.storage.address,
      abi: calibration.contracts.storage.abi,
      events: ['ServiceTerminated', 'DataSetCreated'],
      startBlock: START_BLOCK,
    },
    serviceProviderRegistry: {
      address: calibration.contracts.serviceProviderRegistry.address,
      abi: calibration.contracts.serviceProviderRegistry.abi,
      events: [
        'ProviderRegistered',
        'ProviderRemoved',
        'ProviderInfoUpdated',
        'ProductUpdated',
      ],
      startBlock: START_BLOCK,
    },
  },
  schema,
  relations,
})
