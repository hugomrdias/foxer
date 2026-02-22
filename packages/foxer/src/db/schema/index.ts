import { defineRelations } from 'drizzle-orm'

import { blocks } from './blocks.ts'
import { transactions } from './transactions.ts'

export const relations = defineRelations({ blocks, transactions }, (r) => {
  return {
    blocks: {
      transactions: r.many.transactions(),
    },
    transactions: {
      block: r.one.blocks({
        from: r.transactions.blockNumber,
        to: r.blocks.number,
      }),
    },
  }
})

export const schema = { blocks, transactions }
export type Schema = typeof schema
