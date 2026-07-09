import type { Address, Hash, Hex } from 'viem'

/**
 * Lowercases hash/address/data strings before storage or parsing.
 */
export function normalizeHex<T extends Hex | Address | Hash>(value: T): T {
  return value.toLowerCase() as T
}

/**
 * Converts a normalized JSON-RPC hex string into a driver bytea parameter.
 *
 * Drizzle encodes custom column values for inserts, but prepared placeholders
 * are passed directly to the driver, so bytea lookups need bytes explicitly.
 */
export function hexToBytes(value: Hex): Uint8Array {
  return Buffer.from(value.slice(2), 'hex')
}
