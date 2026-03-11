# foxer

`foxer` is the core package for defining and running a Filecoin indexing/API service.

## Features

- Typed config via `createConfig`.
- Contract/event indexing with hook registration.
- Drizzle schema and relation support.
- Runtime support for API + indexer bootstrap via CLI.
- Exposes API and schema helpers through subpath exports.

## Install

```bash
npm install foxer
```

## Entrypoint

- Package root: `foxer`
- Subpath exports: `foxer/api`, `foxer/schema`
- CLI binary: `foxer`

## Usage

### Define config

```ts
import { createConfig } from 'foxer'
import { http } from 'viem'

export const config = createConfig({
  client: {
    transport: http(process.env.RPC_URL),
    realtimeTransport: http(process.env.RPC_LIVE_URL),
    chain: /* your viem chain */,
  },
  contracts: {
    // contract definitions
  },
  hooks: ({ registry }) => {
    // registry.on(...) handlers
  },
  hono: ({ db, logger }) => {
    // return your Hono app
  },
  schema: {},
})
```

### Run locally

```bash
foxer dev
```
