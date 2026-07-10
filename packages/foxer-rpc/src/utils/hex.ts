import type { Address, Hash, Hex } from 'viem'

/**
 * Lowercases hash/address/data strings before storage or parsing.
 */
export function normalizeHex<T extends Hex | Address | Hash>(value: T): T {
  return value.toLowerCase() as T
}

/**
 * Normalizes a JSON-RPC hex string to a fixed-width canonical `0x` value.
 *
 * Requires a `0x` prefix, validates hex digits, lowercases the payload, and
 * left-pads with zero nibbles to `byteWidth`. Odd-length payloads are padded
 * with one leading zero nibble before width normalization. `byteWidth` must be
 * a positive safe integer. Empty or over-width values are rejected.
 */
export function normalizeFixedWidthHex(
  value: string,
  byteWidth: number,
  context?: string
): Hex {
  const label = context ? `${context}: ` : ''

  if (!Number.isSafeInteger(byteWidth) || byteWidth <= 0) {
    throw new Error(`${label}byte width must be a positive safe integer`)
  }

  if (!/^0x/i.test(value)) {
    throw new Error(`${label}hex value must start with 0x: ${value}`)
  }

  const digits = value.slice(2)
  if (digits.length === 0 || !/^[0-9a-fA-F]+$/.test(digits)) {
    throw new Error(`${label}invalid hex value: ${value}`)
  }

  const evenDigits = digits.length % 2 === 1 ? `0${digits}` : digits
  const payloadBytes = evenDigits.length / 2
  if (payloadBytes > byteWidth) {
    throw new Error(`${label}hex value exceeds ${byteWidth} bytes: ${value}`)
  }

  return `0x${evenDigits.padStart(byteWidth * 2, '0').toLowerCase()}` as Hex
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
