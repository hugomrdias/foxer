import { calibration } from '@filoz/synapse-core/chains'
import {
  bigint,
  foreignKey,
  json,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
// books.ts
import { Hono } from 'hono'
import { createConfig } from './config/config'
import { blocks } from './db/schema/blocks'

export const datasets = pgTable(
  'datasets',
  {
    blockNumber: bigint('block_number', { mode: 'bigint' }).notNull(),
    id: bigint('id', { mode: 'bigint' }).notNull(),
    providerId: bigint('provider_id', { mode: 'bigint' }).notNull(),
    pdpRailId: bigint({ mode: 'bigint' }),
    cdnRailId: bigint({ mode: 'bigint' }),
    cacheMissRailId: bigint({ mode: 'bigint' }),
    payee: text('payee'),
    storageProvider: text('storage_provider'),
    accountAddress: text('account_address').notNull(),
    metadata: json('metadata').$type<Record<string, unknown>>(),
    createdAt: timestamp('created_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.id] }),
    foreignKey({
      columns: [table.blockNumber],
      foreignColumns: [blocks.number],
      name: 'datasets_block_fk',
    }).onDelete('cascade'),
  ]
)

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
  schema: {
    datasets,
  },
  hooks: ({ db, schema, registry }) => {
    registry.on('pdpVerifier:PiecesAdded', ({ context, event }) => {
      console.log('🚀 ~ registry.on ~ event:', event.args, event.log, context)
    })
    registry.on('pdpVerifier:PiecesRemoved', ({ context, event, log }) => {
      console.log('🚀 ~ registry.on ~ event:', event.args, log.args, context)
    })
  },
})

// console.log('🚀 ~ config:', config.contracts)
//                             ^?
