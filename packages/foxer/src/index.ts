import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const schemaFiles = [
  resolve(__dirname, './db/schema/blocks.ts'),
  resolve(__dirname, './db/schema/transactions.ts'),
]

export { createConfig } from './config/config.ts'
export { schema } from './db/schema/index.ts'
