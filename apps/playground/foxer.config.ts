import { calibration } from '@filoz/synapse-core/chains'
import { metadataArrayToObject } from '@filoz/synapse-core/utils'
import { eq } from 'drizzle-orm'
import type { Database as FoxerDatabase, HookRegistry } from 'foxer'
import { createConfig } from 'foxer'

import { stringify } from 'viem'
import { buildApp } from './src/app.ts'
import { relations, schema } from './src/schema/index.ts'

export const config = createConfig({
  drizzleFolder: './drizzle',
  app: buildApp,
  contracts: {
    sessionKeyRegistry: {
      address: calibration.contracts.sessionKeyRegistry.address,
      abi: calibration.contracts.sessionKeyRegistry.abi,
      events: ['AuthorizationsUpdated'],
    },
    pdpVerifier: {
      address: calibration.contracts.pdp.address,
      abi: calibration.contracts.pdp.abi,
      events: ['PiecesAdded', 'PiecesRemoved'],
    },
    storage: {
      address: calibration.contracts.storage.address,
      abi: calibration.contracts.storage.abi,
      events: ['ServiceTerminated', 'DataSetCreated'],
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
    console.log('🚀 ~ storageEvents ~ event:', stringify(event.args))
    const ds = event.args

    const metadata = metadataArrayToObject([ds.metadataKeys, ds.metadataValues])

    await context.db
      .insert(schema.datasets)
      .values({
        ...ds,
        metadata,
        blockNumber: context.blockNumber,
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
    const ds = event.args
    await context.db
      .delete(schema.datasets)
      .where(eq(schema.datasets.dataSetId, ds.dataSetId))
  })
}
