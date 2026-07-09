import type { Hex } from 'viem'

import type { Database } from '../../db/client.ts'
import { RpcError } from './errors.ts'

/**
 * Resolves Ethereum block tags and hex quantities into local block heights.
 */
export async function resolveBlockNumber(
  args: { db: Database },
  value: unknown
): Promise<bigint | null> {
  if (
    value == null ||
    value === 'latest' ||
    value === 'safe' ||
    value === 'finalized' ||
    value === 'pending'
  ) {
    return (await args.db.$prepared.getLatestBlock.execute())[0]?.number ?? null
  }
  if (value === 'earliest') return 0n
  if (typeof value === 'string' && value.startsWith('0x')) {
    return requireQuantity(value, 'block parameter')
  }
  throw new RpcError(-32602, 'invalid block parameter')
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
    throw new RpcError(-32602, `invalid ${name}`)
  }
  return BigInt(value)
}

export function requireQuantityNumber(value: unknown, name: string): number {
  const quantityValue = requireQuantity(value, name)
  if (quantityValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RpcError(-32602, `invalid ${name}`)
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
    throw new RpcError(-32602, `invalid ${name}`)
  }
  return value.toLowerCase() as Hex
}
