import { blocks } from './blocks.ts'
import { logs } from './logs.ts'
import { transactions } from './transactions.ts'

export const schema = {
  blocks,
  transactions,
  logs,
}

export { blocks, logs, transactions }
export type Schema = typeof schema
