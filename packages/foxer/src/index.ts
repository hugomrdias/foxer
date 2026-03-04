import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const schemaFiles = [
  resolve(__dirname, './db/schema/blocks.ts'),
  resolve(__dirname, './db/schema/transactions.ts'),
]

export { PGlite } from '@electric-sql/pglite'
export { sqlMiddleware } from './api/sql-middleware.ts'
export type * from './config/config.ts'
export { createConfig } from './config/config.ts'
export type { Database } from './db/client.ts'
export { buildConflictUpdateColumns } from './db/client.ts'
export * from './db/column-types.ts'
export { schema } from './db/schema/index.ts'
export type { HookRegistry } from './hooks/registry.ts'
export type * from './rpc/client.ts'
export type { Logger } from './utils/logger.ts'
export type * from './utils/types.ts'
