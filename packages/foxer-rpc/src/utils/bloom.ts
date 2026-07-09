import { type Hex, hexToBytes, keccak256 } from 'viem'

export const zeroLogsBloom =
  '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'

/**
 * Recomputes an Ethereum logs bloom from log addresses and topics.
 *
 * Blooms are not stored in the database to save 256 bytes per block/receipt, so
 * JSON-RPC block and receipt responses call this when they need the bloom field.
 */
export function createLogsBloom(values: Hex[]): Hex {
  const bloom = new Uint8Array(256)

  for (const value of values) {
    addToBloom(bloom, value)
  }

  return `0x${Buffer.from(bloom).toString('hex')}` as Hex
}

/**
 * Sets the three Ethereum bloom bits for one address or topic value.
 */
function addToBloom(bloom: Uint8Array, value: Hex) {
  const hash = hexToBytes(keccak256(value))

  for (let i = 0; i < 6; i += 2) {
    const bitIndex = ((hash[i] << 8) | hash[i + 1]) & 0x7ff
    const byteIndex = 255 - Math.floor(bitIndex / 8)
    const bitMask = 1 << (bitIndex % 8)
    bloom[byteIndex] |= bitMask
  }
}
