import { type Hex, hexToBytes, keccak256 } from 'viem'

export const zeroLogsBloom = `0x${'00'.repeat(256)}` as Hex

/**
 * Recomputes an Ethereum receipt logs bloom from log addresses and topics.
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
