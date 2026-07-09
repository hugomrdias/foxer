import { eq, sql } from 'drizzle-orm'

import { schema } from '../../../db/schema/index.ts'
import { hexToBytes } from '../../../utils/hex.ts'
import { decodeTransaction } from '../../decode.ts'
import type { MethodContext } from '../types.ts'
import { requireHex } from '../validation.ts'

/**
 * Implements `eth_getTransactionByHash` from the transaction primary key.
 */
export async function ethGetTransactionByHash(
  args: MethodContext,
  params: unknown[]
) {
  const hash = requireHex(params[0], 'transaction hash', 32)
  const [row] = await args.db
    .select({
      tx: schema.transactions,
      block: schema.blocks,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.blocks,
      eq(schema.transactions.blockNumber, schema.blocks.number)
    )
    .where(sql`${schema.transactions.hash} = ${hexToBytes(hash)}`)
    .limit(1)
  if (!row) return null
  return decodeTransaction(row.tx, args.config.chainId, row.block)
}
