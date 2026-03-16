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
import { createConfig } from '@hugomrdias/foxer'
import { http } from 'viem'

export const config = createConfig({
  client: {
    transport: http(process.env.RPC_URL),
    realtimeTransport: http(process.env.RPC_LIVE_URL),
    chain: /* your viem chain */,
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

## Example

```ts
import { createConfig } from '@hugomrdias/foxer'
import { http } from 'viem'

export const config = createConfig({
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
