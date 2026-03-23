import { type Client, compileQuery } from '@hugomrdias/foxer-client'
import type { QueryKey } from '@tanstack/react-query'

import type { ResolvedSchema } from './index.js'

export type SQLWrapper = Exclude<Parameters<typeof compileQuery>[0], string>

export const stringify: typeof JSON.stringify = (value, replacer, space) =>
  JSON.stringify(
    value,
    (key, value_) => {
      const value = typeof value_ === 'bigint' ? value_.toString() : value_
      return typeof replacer === 'function' ? replacer(key, value) : value
    },
    space
  )

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
