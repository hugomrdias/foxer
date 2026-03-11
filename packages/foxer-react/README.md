# foxer-react

`@hugomrdias/foxer-react` adds React bindings for `@hugomrdias/foxer-client`, including provider wiring and typed query hooks powered by React Query.

## What it includes

- `FoxerProvider` for app-level client context
- `useFoxerClient()` to access the typed client
- `useFoxerQuery()` for typed queries with optional live updates
- `useFoxerQueryOptions()` for custom React Query integrations

## Install

```bash
npm install @hugomrdias/foxer-react @hugomrdias/foxer-client @tanstack/react-query react wagmi viem
```

## Package entrypoint

- Package: `@hugomrdias/foxer-react`
- Main exports: `FoxerProvider`, `useFoxerClient`, `useFoxerQuery`, `useFoxerQueryOptions`

## Usage

```tsx
import { createClient } from '@hugomrdias/foxer-client'
import { FoxerProvider, useFoxerQuery } from '@hugomrdias/foxer-react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const queryClient = new QueryClient()
const foxer = createClient({
  baseUrl: 'http://localhost:4200/sql',
  schema,
  relations,
})

function SessionKeys() {
  const { data, isPending } = useFoxerQuery({
    queryFn: (db) =>
      db.query.sessionKeys.findMany({
        limit: 10,
        orderBy: { blockNumber: 'desc' },
      }),
  })

  if (isPending) return <p>Loading...</p>
  return <pre>{JSON.stringify(data, null, 2)}</pre>
}

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <FoxerProvider client={foxer}>
        <SessionKeys />
      </FoxerProvider>
    </QueryClientProvider>
  )
}
```

`useFoxerQuery()` enables live updates by default. Pass `live: false` if you only want a normal React Query request.

## Type registration

If you want `useFoxerQuery()` and `useFoxerClient()` to infer your schema globally, augment the package `Register` interface:

```ts
declare module '@hugomrdias/foxer-react' {
  interface Register {
    schema: typeof schema
    relations: typeof relations
  }
}
```

As with `client.live()`, your query function should return a Drizzle query builder and not call `.execute()`.
