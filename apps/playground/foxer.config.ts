import { calibration } from '@filoz/synapse-core/chains'
import { createConfig } from 'foxer'
import type { HookRegistry } from 'foxer/src/hooks/registry.ts'
import { Hono } from 'hono'
import { relations, schema } from './src/schema/index.ts'

const app = new Hono()

app.get('/books', (c) => c.json('list books'))
app.post('/books', (c) => c.json('create a book', 201))
app.get('/books/:id', (c) => c.json(`get ${c.req.param('id')}`))

export const config = createConfig({
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
  app,
  schema,
  relations,
  hooks: ({ db, schema, registry }) => {
    storageEvents(registry)
  },
})

export type Registry = HookRegistry<typeof config.contracts>

function storageEvents(registry: Registry) {
  registry.on('storage:DataSetCreated', async ({ context, event }) => {
    const ds = event.args
  })
  registry.on('storage:ServiceTerminated', async ({ context, event }) => {
    const ds = event.args
  })
}
