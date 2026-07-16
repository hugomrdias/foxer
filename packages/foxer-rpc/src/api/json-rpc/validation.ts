import { asc, desc } from 'drizzle-orm'
import type { NodePgDatabase } from 'drizzle-orm/node-postgres'
import type { Hex } from 'viem'

import type { InternalConfig } from '../../config.ts'
import { schema } from '../../db/schema/index.ts'
import { InvalidParamsError } from './errors.ts'

const BLOCK_TAGS = new Set([
  'earliest',
  'finalized',
  'latest',
  'pending',
  'safe',
])

/** Validates a block quantity or supported local block tag without querying. */
export function validateBlockParameter(value: unknown): void {
  if (value == null || BLOCK_TAGS.has(value as string)) return
  if (typeof value === 'string' && value.startsWith('0x')) {
    requireQuantity(value, 'block parameter')
    return
  }
  throw new InvalidParamsError('invalid block parameter')
}

/**
 * Resolves Ethereum block tags and hex quantities against available local data.
 *
 * `safe` and `finalized` share the configured finality depth. `pending` is the
 * latest indexed block because this indexer does not expose a pending block.
 */
export async function resolveBlockNumber(
  args: {
    db: NodePgDatabase
    config: Pick<InternalConfig, 'finality'>
  },
  value: unknown
): Promise<bigint | null> {
  validateBlockParameter(value)
  if (typeof value === 'string' && value.startsWith('0x')) {
    return requireQuantity(value, 'block parameter')
  }

  if (value === 'earliest') return selectBoundaryBlock(args.db, 'earliest')
  if (value == null || value === 'latest' || value === 'pending') {
    return selectBoundaryBlock(args.db, 'latest')
  }
  if (value === 'safe' || value === 'finalized') {
    const latest = await selectBoundaryBlock(args.db, 'latest')
    if (latest == null) return null
    const earliest = await selectBoundaryBlock(args.db, 'earliest')
    if (earliest == null) return null
    const finality = args.config.finality > 0n ? args.config.finality : 0n
    const resolved = latest - finality
    return resolved < earliest ? earliest : resolved
  }

  throw new InvalidParamsError('invalid block parameter')
}

async function selectBoundaryBlock(
  db: NodePgDatabase,
  boundary: 'earliest' | 'latest'
) {
  return (
    (
      await db
        .select({ number: schema.blocks.number })
        .from(schema.blocks)
        .orderBy(
          boundary === 'earliest'
            ? asc(schema.blocks.number)
            : desc(schema.blocks.number)
        )
        .limit(1)
    )[0]?.number ?? null
  )
}

/**
 * Validates an Ethereum JSON-RPC quantity and returns it as a bigint.
 *
 * Quantities are not arbitrary hex strings: zero is `0x0`, non-zero values must
 * not have leading zeroes, and an empty `0x` is invalid.
 */
export function requireQuantity(value: unknown, name: string): bigint {
  if (
    typeof value !== 'string' ||
    !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)
  ) {
    throw new InvalidParamsError(`invalid ${name}`)
  }
  return BigInt(value)
}

export function requireQuantityNumber(value: unknown, name: string): number {
  const quantityValue = requireQuantity(value, name)
  if (quantityValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new InvalidParamsError(`invalid ${name}`)
  }
  return Number(quantityValue)
}

/**
 * Validates and normalizes an expected hex string parameter.
 */
export function requireHex(
  value: unknown,
  name: string,
  byteLength?: number
): Hex {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-fA-F]*$/.test(value) ||
    value.length % 2 !== 0 ||
    (byteLength != null && value.length !== 2 + byteLength * 2)
  ) {
    throw new InvalidParamsError(`invalid ${name}`)
  }
  return value.toLowerCase() as Hex
}
