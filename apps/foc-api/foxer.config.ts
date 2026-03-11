import { calibration } from '@filoz/synapse-core/chains'
import type { Database as FoxerDatabase, HookRegistry } from 'foxer'
import { createConfig } from 'foxer'
import { http } from 'viem'
import { buildApp } from './src/app.ts'
import { handleDatasets } from './src/hooks/handle-datasets.ts'
import { handlePieces } from './src/hooks/handle-pieces.ts'
import { handleProviders } from './src/hooks/handle-providers.ts'
import { handleSessionKeys } from './src/hooks/handle-session-keys.ts'
import { relations, schema } from './src/schema/index.ts'

const START_BLOCK = 3140755n + 379_000n // service provider registry start block

export type Database = FoxerDatabase<typeof schema, typeof relations>

export type Registry = HookRegistry<
  typeof config.contracts,
  typeof config.schema,
  typeof config.relations
>

export const config = createConfig({
  hono: buildApp,
  hooks: ({ registry }) => {
    handleDatasets(registry)
    handlePieces(registry)
    handleProviders(registry)
    handleSessionKeys(registry)
  },
  batchSize: 500,
  client: {
    transport: http(process.env.RPC_URL, {
      batch: {
        batchSize: 10,
      },
    }),
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
      address: calibration.contracts.fwss.address,
      abi: calibration.contracts.fwss.abi,
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
