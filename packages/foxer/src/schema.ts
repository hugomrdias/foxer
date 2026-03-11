import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))

export const schemaFiles = [
  resolve(__dirname, './db/schema/blocks.js'),
  resolve(__dirname, './db/schema/transactions.js'),
]
export { schema } from './db/schema/index.ts'
