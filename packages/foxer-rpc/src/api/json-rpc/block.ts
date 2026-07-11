import { hexToBytes } from 'viem'
import type { schema } from '../../db/schema/index.ts'
import type { MethodContext } from './types.ts'
import { requireHex, resolveBlockNumber } from './validation.ts'

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
