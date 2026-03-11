# foxer-react

`foxer-react` adds React bindings for `foxer-client`, including context wiring and live query hooks powered by React Query.

## Features

- `FoxerProvider` for app-level client context.
- `useFoxerClient` to access the typed client.
- `useFoxerQuery` for typed queries with optional live updates.
- `useFoxerQueryOptions` helper for custom query integration.

## Install

```bash
npm install foxer-react foxer-client @tanstack/react-query react
```

## Entrypoint

- Package root: `foxer-react`
- Main exports: `FoxerProvider`, `useFoxerClient`, `useFoxerQuery`, `useFoxerQueryOptions`

## Usage

```tsx
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { createClient } from 'foxer-client'
import { FoxerProvider, useFoxerQuery } from 'foxer-react'

const queryClient = new QueryClient()
const foxer = createClient({
  baseUrl: 'http://localhost:4200/sql',
  schema,
  relations,
})

function SessionKeys() {
  const { data, isPending } = useFoxerQuery({
    live: true,
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
