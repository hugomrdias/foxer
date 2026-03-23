# foxer

`foxer` is the core package for building a Filecoin indexing service with a typed config, a Hono API, and a built-in development runtime.

## What it includes

- End-to-end type safety & autocomplete with no codegen
- Contract events indexing
- Hono middleware with support for SQL over HTTP and Live queries
- Database schema and relations powered by Drizzle
- Local development server and database with PGlite
- A `foxer` CLI for project scaffolding and local development

## Install

```bash
npm install @hugomrdias/foxer hono viem
```

## Package entrypoints

- Package: `@hugomrdias/foxer`
- Subpath exports: `@hugomrdias/foxer/api`, `@hugomrdias/foxer/schema`
- CLI binary: `foxer`

## Quick start

### Scaffold a new project

Use the CLI to create a new workspace with starter app templates:

```bash
npx @hugomrdias/foxer create my-foxer-app
```

You can also choose the template explicitly:

```bash
npx @hugomrdias/foxer create my-foxer-app --template app
```

## Create a config

Create a `foxer.config.ts` file in your project root:

```ts
import { calibration } from '@filoz/synapse-core/chains'
import { createConfig } from '@hugomrdias/foxer'
import { http } from 'viem'

export const config = createConfig({
  client: {
    transport: http(process.env.RPC_URL),
    realtimeTransport: http(process.env.RPC_LIVE_URL),
    chain: calibration,
  },
  contracts: {
    // contract definitions keyed by name
  },
  hooks: ({ registry }) => {
    // register event handlers
  },
  hono: ({ db, logger }) => {
    // return your Hono app
  },
  schema: {},
})
```

`createConfig()` accepts a few optional runtime settings in addition to the required `client`, `contracts`, `hooks`, `hono`, and `schema` fields:

- `batchSize` for backfill block batch size
- `finality` for chain finality
- `drizzleFolder` for migration output location
- `database` for choosing `postgres` or `pglite`
- `relations` for Drizzle relations

## Run locally

The `dev` command loads `foxer.config.ts`, runs migrations, starts the API server, and boots the indexer.

```bash
foxer dev
```

Useful flags:

```bash
foxer dev --port 4200
foxer dev --root .
foxer dev --config ./foxer.config.ts
```

The dev server also looks for `.env.local` in the project root.

## Postgres recommendations

Foxer supports both `pglite` and Postgres, but production deployments should use Postgres when you need higher write throughput, concurrent reads, or live SQL subscriptions.

Live SQL requires logical replication to be enabled because Foxer creates a publication and subscribes to table changes at runtime.

Recommended Postgres settings for a dedicated Foxer instance:

```conf
wal_level = logical
max_wal_senders = 8
max_replication_slots = 8
wal_compression = on
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9
max_wal_size = 8GB
min_wal_size = 1GB
random_page_cost = 1.1
effective_io_concurrency = 200
default_statistics_target = 200
```

If you treat the chain as the source of truth and can tolerate replaying the most recent blocks after a crash, `synchronous_commit = off` is a valid ingest-speed optimization.

Memory settings depend on the machine. A good starting point is:

- `shared_buffers`: about 25% of RAM
- `effective_cache_size`: about 60-75% of RAM
- `work_mem`: `16MB`
- `maintenance_work_mem`: `512MB`

Foxer now defaults the Node Postgres pool to:

- `application_name: 'foxer'`
- `max: 10`
- `connectionTimeoutMillis: 5000`
- `idleTimeoutMillis: 30000`

You can still override those defaults with `database.options` in `foxer.config.ts`:

```ts
import { createConfig } from '@hugomrdias/foxer'
import { http } from 'viem'

export const config = createConfig({
  client: {
    transport: http(process.env.RPC_URL),
    realtimeTransport: http(process.env.RPC_LIVE_URL),
    chain: /* your viem chain */,
  },
  database: {
    driver: 'postgres',
    url: process.env.DATABASE_URL,
    options: {
      max: 20,
      idleTimeoutMillis: 60_000,
    },
  },
  contracts: {},
  hooks: ({ registry }) => {
    // register event handlers
  },
  hono: ({ db, logger }) => {
    // return your Hono app
  },
  schema: {},
})
```

## Example

```ts
import { createConfig } from '@hugomrdias/foxer'
import { http } from 'viem'

export const config = createConfig({
  batchSize: 500,
  client: {
    transport: http(process.env.RPC_URL),
    realtimeTransport: http(process.env.RPC_LIVE_URL),
    chain: /* calibration, mainnet, etc */,
  },
  contracts: {
    myContract: {
      address: '0x...',
      abi: [],
      events: ['Transfer'],
      startBlock: 0n,
    },
  },
  hooks: ({ registry }) => {
    // registry.on(...)
  },
  hono: ({ db, logger }) => {
    // build and return your Hono app
  },
  schema: {},
})
```

## Related packages

- `@hugomrdias/foxer-client` for consuming the SQL/API layer from clients
- `@hugomrdias/foxer-react` for React integration helpers
