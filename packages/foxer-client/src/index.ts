import {
  type AnyColumn,
  type AnyRelations,
  Column,
  type EmptyRelations,
  is,
  mapRelationalRow,
  type QueryWithTypings,
  type SelectedFieldsOrdered,
  SQL,
  type SQLWrapper,
  Table,
} from 'drizzle-orm'
import type { PgDialect } from 'drizzle-orm/pg-core'
import { PgRelationalQuery } from 'drizzle-orm/pg-core/query-builders/query'
import { PgRaw } from 'drizzle-orm/pg-core/query-builders/raw'
import { drizzle, type PgRemoteDatabase } from 'drizzle-orm/pg-proxy'
import { TypedQueryBuilder } from 'drizzle-orm/query-builders/query-builder'
import { EventSource } from 'eventsource'
import type { Simplify } from 'type-fest'
import { stringify } from 'viem'

function orderSelectedFields<TColumn extends AnyColumn>(
  fields: Record<string, unknown>,
  pathPrefix?: string[]
): SelectedFieldsOrdered<TColumn> {
  return Object.entries(fields).reduce<SelectedFieldsOrdered<AnyColumn>>(
    (result, [name, field]) => {
      if (typeof name !== 'string') {
        return result
      }

      const newPath = pathPrefix ? [...pathPrefix, name] : [name]
      if (is(field, Column) || is(field, SQL) || is(field, SQL.Aliased)) {
        result.push({ path: newPath, field })
      } else if (is(field, Table)) {
        result.push(
          // @ts-expect-error
          ...orderSelectedFields(field[Table.Symbol.Columns], newPath)
        )
      } else {
        result.push(
          ...orderSelectedFields(field as Record<string, unknown>, newPath)
        )
      }
      return result
    },
    []
  ) as SelectedFieldsOrdered<TColumn>
}

const getUrl = (
  baseUrl: string,
  method: 'live' | 'db',
  query?: QueryWithTypings
) => {
  const url = new URL(baseUrl)
  url.pathname = `${url.pathname}/${method}`
  if (query) {
    url.searchParams.set('sql', stringify(query))
  }
  return url
}

const noopDatabase = drizzle(() => Promise.resolve({ rows: [] }), {
  casing: 'snake_case',
})

// @ts-expect-error - dialect is not typed
const dialect: PgDialect = noopDatabase.dialect

export const compileQuery = (query: SQLWrapper) => {
  return dialect.sqlToQuery(query.getSQL())
}

type ClientDb<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> = Simplify<
  Omit<
    PgRemoteDatabase<TSchema, TRelations>,
    | 'insert'
    | 'update'
    | 'delete'
    | 'transaction'
    | 'refreshMaterializedView'
    | '_query'
  >
>

export type Client<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
> = {
  db: ClientDb<TSchema, TRelations>

  live: <result>(
    queryFn: (db: ClientDb<TSchema, TRelations>) => Promise<result>,
    onData: (result: result) => void,
    onError?: (error: Error) => void
  ) => {
    unsubscribe: () => void
  }
}

export function createClient<
  TSchema extends Record<string, unknown> = Record<string, unknown>,
  TRelations extends AnyRelations = EmptyRelations,
>({
  baseUrl,
  relations,
  schema,
}: {
  baseUrl: string
  relations: TRelations
  schema: TSchema
}): Client<TSchema, TRelations> {
  return {
    db: drizzle(
      async (sql, params, method, typings) => {
        const query = { sql, params, typings }
        const url = getUrl(baseUrl, 'db', query)

        const rsp = await fetch(url.toString(), {
          method: 'GET',
        })
        if (!rsp.ok) {
          throw new Error((await rsp.json()).error)
        }

        const result = await rsp.json()

        if (method === 'all') {
          return {
            ...result,
            rows: result.rows.map((row: object) => Object.values(row)),
          }
        }

        return result
      },
      {
        relations: relations,
        schema: schema,
        casing: 'snake_case',
      }
    ),
    live: (queryFn, onData, onError) => {
      // biome-ignore lint/suspicious/noExplicitAny: fix later
      let result: any
      const passThroughDatabase = drizzle(
        (_, __, method) => {
          if (method === 'all') {
            return Promise.resolve({
              ...result,
              rows: result.rows.map((row: object) => Object.values(row)),
            })
          }

          return Promise.resolve(result)
        },
        { schema: schema, relations: relations, casing: 'snake_case' }
      )
      const queryPromise = queryFn(passThroughDatabase)

      if ('getSQL' in queryPromise === false) {
        throw new Error(
          '"queryFn" must return SQL. You may have to remove `.execute()` from your query.'
        )
      }
      const queryBuilder = queryPromise as unknown as SQLWrapper

      const query = compileQuery(queryBuilder)
      const sse = new EventSource(getUrl(baseUrl, 'live', query))

      async function onMessage(event: MessageEvent) {
        result = JSON.parse(event.data)
        let data: unknown

        if (queryBuilder instanceof TypedQueryBuilder) {
          data = await passThroughDatabase._.session
            .prepareQuery(
              query,
              // @ts-expect-error - selectedFields is not typed
              orderSelectedFields(queryPromise._.selectedFields),
              undefined,
              false
            )
            .execute()
        } else if (queryBuilder instanceof PgRelationalQuery) {
          // @ts-expect-error - _toSQL is not typed
          const selection = queryBuilder._toSQL().query.selection

          data = await passThroughDatabase._.session
            .prepareQuery(
              query,
              undefined,
              undefined,
              true,
              (rawRows, mapColumnValue) => {
                const rows = rawRows.map((row) => {
                  const obj = {}
                  row.forEach((value, index) => {
                    // @ts-expect-error - selection is not typed
                    obj[selection[index].key] = value
                  })
                  return mapRelationalRow(obj, selection, mapColumnValue)
                })
                // @ts-expect-error - mode is not typed
                if (queryBuilder.mode === 'first') {
                  return rows[0]
                }
                return rows
              }
            )
            .execute()
        } else if (queryBuilder instanceof PgRaw) {
          data = await passThroughDatabase._.session
            .prepareQuery(query, undefined, undefined, false)
            .execute()
        } else {
          throw new Error('Unsupported query builder')
        }

        // @ts-expect-error - data is not typed
        onData(data)
      }

      function onSSEError(event: Event | MessageEvent) {
        if ('data' in event) {
          onError?.(new Error(event.data))
        } else {
          // @ts-expect-error - message is not typed
          onError?.(new Error(`SSE error ${event?.message}`))
        }
        sse.close()
      }

      sse.addEventListener('message', onMessage)
      sse.addEventListener('error', onSSEError)

      return {
        unsubscribe: () => {
          sse.removeEventListener('message', onMessage)
          sse.removeEventListener('error', onSSEError)
          sse.close()
        },
      }
    },
  }
}
