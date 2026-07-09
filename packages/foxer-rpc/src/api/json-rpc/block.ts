import { hexToBytes } from 'viem'
import type { InternalConfig } from '../../config.ts'
import type { Database } from '../../db/client.ts'
import type { schema } from '../../db/schema/index.ts'
import { decodeBlock } from '../decode.ts'
import type { MethodContext } from './types.ts'
import { requireHex, resolveBlockNumber } from './validation.ts'

/**
 * Loads a block's header, transactions, and logs, then builds the wire response.
 */
export async function decodeBlockByRow(
  args: { db: Database; config: InternalConfig },
  block: typeof schema.blocks.$inferSelect,
  fullTransactions: boolean
) {
  const [transactions, logs] = await Promise.all([
    args.db.$prepared.getTransactionsByBlockNumber.execute({
      blockNumber: block.number,
    }),
    args.db.$prepared.getLogsByBlockNumber.execute({
      blockNumber: block.number,
    }),
  ])
  return decodeBlock(
    block,
    transactions,
    logs,
    fullTransactions,
    args.config.chainId
  )
}

/**
 * Resolves a block by hash, number or tag (latest, earliest, pending, safe, finalized).
 */
export async function resolveBlock(
  args: MethodContext,
  value: unknown
): Promise<typeof schema.blocks.$inferSelect | null> {
  if (typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/.test(value)) {
    const hash = requireHex(value, 'block hash', 32)
    const rows = await args.db.$prepared.getBlockByHash.execute({
      hash: hexToBytes(hash),
    })
    return rows[0] ?? null
  }

  const blockNumber = await resolveBlockNumber(args, value)
  if (blockNumber == null) return null
  const rows = await args.db.$prepared.getBlockByNumber.execute({ blockNumber })
  return rows[0] ?? null
}
