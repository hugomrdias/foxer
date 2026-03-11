# foxer-client

`foxer-client` provides a typed Drizzle-compatible client for querying `foxer` SQL endpoints, including live updates over SSE.

## Features

- Typed remote Drizzle client via `createClient`.
- Query compilation helper with `compileQuery`.
- Live query subscriptions using Server-Sent Events.
- Works with schema + relations for end-to-end type safety.

## Install

```bash
npm install foxer-client viem
```

## Entrypoint

- Package root: `foxer-client`
- Main export: `createClient`

## Usage

```ts
import { createClient } from 'foxer-client'
import { schema, relations } from './schema'

const client = createClient({
  baseUrl: 'http://localhost:4200/sql',
  schema,
  relations,
})

const rows = await client.db.query.sessionKeys.findMany({
  limit: 10,
  orderBy: { blockNumber: 'desc' },
})

const { unsubscribe } = client.live(
  (db) => db.query.sessionKeys.findMany({ limit: 10 }),
  (data) => {
    console.log('live rows', data)
  },
  (error) => {
    console.error(error)
  }
)

// later
unsubscribe()
```
