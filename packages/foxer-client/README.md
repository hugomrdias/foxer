# foxer-client

`@hugomrdias/foxer-client` provides a typed Drizzle-compatible client for querying `foxer` SQL endpoints, including live updates over Server-Sent Events.

## What it includes

- `createClient()` for a typed remote Drizzle client
- `compileQuery()` for turning Drizzle query builders into SQL payloads
- `client.live()` for live query subscriptions over SSE
- Schema and relations support for end-to-end type safety

## Install

```bash
npm install @hugomrdias/foxer-client viem
```

## Package entrypoint

- Package: `@hugomrdias/foxer-client`
- Main exports: `createClient`, `compileQuery`

## Create a client

Point the client at the `foxer` SQL endpoint, usually `http://localhost:4200/sql` during local development:

```ts
import { createClient } from '@hugomrdias/foxer-client'
import { relations, schema } from './schema'

const client = createClient({
  baseUrl: 'http://localhost:4200/sql',
  schema,
  relations,
})
```

## Query data

```ts
const rows = await client.db.query.sessionKeys.findMany({
  limit: 10,
  orderBy: { blockNumber: 'desc' },
})
```

## Subscribe to live updates

```ts
const { unsubscribe } = client.live(
  (db) =>
    db.query.sessionKeys.findMany({
      limit: 10,
      orderBy: { blockNumber: 'desc' },
    }),
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

The `queryFn` passed to `live()` must return a Drizzle query builder, not an executed promise. In practice that means returning the query directly and not calling `.execute()`.

## When to use it

Use `@hugomrdias/foxer-client` when you want:

- typed reads against a remote `foxer` API
- live query refreshes without writing SSE plumbing yourself
- a shared schema contract between your API package and frontend
