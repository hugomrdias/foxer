import { type Client, compileQuery } from '@hugomrdias/foxer-client'
import type { QueryKey } from '@tanstack/react-query'
import { stringify } from 'viem'

import type { ResolvedSchema } from './index.js'

export type SQLWrapper = Exclude<Parameters<typeof compileQuery>[0], string>

export function getFoxerQueryOptions<T>(
  client: Client<ResolvedSchema>,
  queryFn: (db: Client<ResolvedSchema>['db']) => T
): {
  queryKey: QueryKey
  queryHash: string
  queryFn: () => T
} {
  const queryPromise = queryFn(client.db)
  // @ts-expect-error
  if ('getSQL' in queryPromise === false) {
    throw new Error(
      '"queryFn" must return SQL. You may have to remove `.execute()` from your query.'
    )
  }

  const query = compileQuery(queryPromise as unknown as SQLWrapper)
  const queryHash = `${query.sql}::${stringify(query.params)}`
  const queryKey = ['__foxer_react', queryHash]

  return {
    queryKey,
    queryHash,
    queryFn: () => queryPromise,
  }
}
