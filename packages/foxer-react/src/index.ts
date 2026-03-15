'use client'

import type { Client } from '@hugomrdias/foxer-client'
import {
  type DefaultError,
  type QueryKey,
  type UseQueryOptions,
  type UseQueryResult,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import type { EmptyRelations } from 'drizzle-orm/relations'
import { createContext, createElement, useContext, useEffect, useMemo } from 'react'

import { getFoxerQueryOptions } from './utils'

export const FoxerContext = createContext<Client<ResolvedSchema, ResolvedRelations> | undefined>(
  undefined,
)

type FoxerProviderProps = {
  client: Client<ResolvedSchema, ResolvedRelations>
}

export function FoxerProvider(parameters: React.PropsWithChildren<FoxerProviderProps>) {
  const { children, client } = parameters
  const props = { value: client }
  return createElement(FoxerContext.Provider, props, children)
}

export function useFoxerClient(): Client<ResolvedSchema, ResolvedRelations> {
  const client = useContext(FoxerContext)
  if (client === undefined) {
    throw new Error('FoxerProvider not found')
  }
  return client
}
// biome-ignore lint/suspicious/noEmptyInterface: its ok
export interface Register {}

export type ResolvedSchema = Register extends { schema: infer schema }
  ? schema
  : {
      [name: string]: unknown
    }

export type ResolvedRelations = Register extends { relations: infer relations }
  ? relations
  : EmptyRelations

export function useFoxerQueryOptions<T>(
  queryFn: (db: Client<ResolvedSchema, ResolvedRelations>['db']) => T,
): {
  queryKey: QueryKey
  queryHash: string
  queryFn: () => T
} {
  const client = useFoxerClient()
  return getFoxerQueryOptions(client, queryFn)
}

export function useFoxerQuery<queryFnData = unknown, error = DefaultError, data = queryFnData>(
  params: {
    queryFn: (db: Client<ResolvedSchema, ResolvedRelations>['db']) => Promise<queryFnData>
    live?: boolean
  } & Omit<UseQueryOptions<queryFnData, error, data>, 'queryFn' | 'queryKey'>,
): UseQueryResult<data, error> {
  const live = params.live ?? true
  const queryClient = useQueryClient()

  const client = useFoxerClient()

  const queryOptions = useMemo(
    () => getFoxerQueryOptions(client, params.queryFn),
    [client, params.queryFn],
  )

  useEffect(() => {
    if (live === false || params.enabled === false) return

    const { unsubscribe } = client.live(queryOptions.queryFn, (data) => {
      queryClient.setQueryData(queryOptions.queryKey, data)
    })
    return unsubscribe
    // oxlint-disable-next-line eslint-plugin-react-hooks/exhaustive-deps
  }, [live, params.enabled, client, queryClient, queryOptions.queryHash])

  return useQuery({
    ...params,
    queryKey: queryOptions.queryKey,
    queryFn: queryOptions.queryFn,
    staleTime: live ? (params.staleTime ?? Number.POSITIVE_INFINITY) : params.staleTime,
  })
}
