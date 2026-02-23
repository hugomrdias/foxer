import { PGlite } from '@electric-sql/pglite'
import {
  type A_Const,
  type Node,
  parse,
  type RawStmt,
} from '@libpg-query/parser'
import type { Visitor } from '@pgsql/traverse'
import { walk } from '@pgsql/traverse'
import type { QueryWithTypings } from 'drizzle-orm'

import { Pool } from 'pg'
import type { Database } from '../db/client'
import type { MaybeResult } from '../types'

// biome-ignore lint/style/noNonNullAssertion: we know the node is not null
const getNodeType = (node: Node) => Object.keys(node)[0]!

export async function parseSql(
  sql: string
): Promise<MaybeResult<{ node: Node; tables: string[] }>> {
  let result: { stmts: RawStmt[] } | undefined
  const tables: string[] = []

  // Using a visitor object (recommended for multiple node types)
  const visitor: Visitor = {
    RangeVar: (path) => {
      tables.push(path.node.relname)
    },
  }

  try {
    result = (await parse(sql)) as { stmts: RawStmt[] }
    walk(result, visitor)
  } catch (error) {
    return { error: new Error('Failed to parse SQL', { cause: error }) }
  }

  if (result?.stmts.length === 0) {
    return { error: new Error('No statement found') }
  }

  if (result?.stmts?.length && result.stmts.length > 1) {
    return { error: new Error('Only one statement is allowed') }
  }

  const stmt = result?.stmts[0]
  if (stmt?.stmt == null) {
    return { error: new Error('Invalid statement') }
  }

  const node = stmt.stmt
  return { result: { node, tables } }
}

export async function validateSql(
  query: QueryWithTypings
): Promise<MaybeResult<string[]>> {
  const { sql, params } = query
  const result = await parseSql(sql)
  if (result.error) {
    return result
  }

  const { node, tables } = result.result

  const nodeType = getNodeType(node)

  if (nodeType !== 'SelectStmt') {
    return { error: new Error('Only select statements are allowed') }
  }

  if (!('SelectStmt' in node)) {
    return { error: new Error('Invalid statement') }
  }
  const selectStmt = node.SelectStmt

  if (selectStmt.lockingClause || selectStmt.intoClause) {
    return { error: new Error('Locking or into clauses are not allowed') }
  }
  if (selectStmt.withClause?.recursive) {
    return { error: new Error('Recursive with clauses are not allowed') }
  }

  if (!selectStmt.limitCount) {
    return { error: new Error('Limit is required') }
  }

  let limit: number | undefined

  if ('ParamRef' in selectStmt.limitCount) {
    const limitIndex = selectStmt.limitCount.ParamRef.number as number
    const _limit = params[limitIndex - 1]
    if (typeof _limit === 'number') {
      limit = _limit
    }
  }

  if ('A_Const' in selectStmt.limitCount) {
    const aConst = selectStmt.limitCount.A_Const as A_Const
    limit = aConst.ival?.ival ?? 0
  }
  if (typeof limit !== 'number' || limit < 1) {
    return {
      error: new Error('Limit is required and must be a number greater than 0'),
    }
  }

  if (limit > 100) {
    return { error: new Error('Limit is too large (max 100)') }
  }

  return { result: tables }
}

export async function executeSql({
  db,
  query,
}: {
  db: Database
  query: QueryWithTypings
}): Promise<MaybeResult<unknown>> {
  let dbResult: unknown | undefined
  if (db.$client instanceof PGlite) {
    dbResult = await db._.session
      .prepareQuery(query, undefined, undefined, false)
      .execute()
  }
  if (db.$client instanceof Pool) {
    dbResult = await db.transaction(
      (tx) => {
        return tx._.session
          .prepareQuery(query, undefined, undefined, false)
          .execute()
      },
      { accessMode: 'read only' }
    )
  }

  if (dbResult == null) {
    return { error: new Error('Failed to execute SQL') }
  }

  return { result: dbResult }
}
