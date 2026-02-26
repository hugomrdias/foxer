import { calibration } from '@filoz/synapse-core/chains'
import { metadataArrayToObject } from '@filoz/synapse-core/utils'
import { eq } from 'drizzle-orm'
import type { Database as FoxerDatabase, HookRegistry } from 'foxer'
import { createConfig } from 'foxer'

import { http } from 'viem'
import { buildApp } from './src/app.ts'
import { relations, schema } from './src/schema/index.ts'

const START_BLOCK = 3493226n - 15000n

export const config = createConfig({
  drizzleFolder: './drizzle',
  hono: buildApp,
  client: {
    transport: http(process.env.RPC_URL, {
      batch: {
        batchSize: 1000,
        wait: 16,
      },
    }),
    realtimeTransport: http(process.env.RPC_LIVE_URL, {}),
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
  },
  schema,
  relations,
  hooks: ({ registry }) => {
    storageEvents(registry)
  },
})

export type Database = FoxerDatabase<typeof schema, typeof relations>

export type Registry = HookRegistry<
  typeof config.contracts,
  typeof config.schema,
  typeof config.relations
>

function storageEvents(registry: Registry) {
  registry.on('storage:DataSetCreated', async ({ context, event }) => {
    context.logger.info({ event: event.args }, 'DataSetCreated')
    const ds = event.args

    const metadata = metadataArrayToObject([ds.metadataKeys, ds.metadataValues])

    await context.db
      .insert(schema.datasets)
      .values({
        ...ds,
        metadata,
        blockNumber: event.block.number,
      })
      .onConflictDoUpdate({
        target: [schema.datasets.dataSetId],
        set: {
          ...ds,
          metadata,
        },
      })
  })
  registry.on('storage:ServiceTerminated', async ({ context, event }) => {
    context.logger.info({ event: event.args }, 'DataSetDeleted')
    const ds = event.args
    await context.db
      .delete(schema.datasets)
      .where(eq(schema.datasets.dataSetId, ds.dataSetId))
  })
}
