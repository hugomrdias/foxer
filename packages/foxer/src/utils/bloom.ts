/** biome-ignore-all lint/style/noNonNullAssertion: no need to check for null */
import { type Hex, hexToBytes, keccak256 } from 'viem'

export const zeroLogsBloom =
  '0x00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000'

// const BLOOM_SIZE_BYTES = 256;

export const isInBloom = (bloomHex: Hex, value: Hex): boolean => {
  const bloom = hexToBytes(bloomHex)
  const hash = hexToBytes(keccak256(value))

  // Ethereum uses 3 pairs of bytes from the hash to determine 3 bits
  for (let i = 0; i < 6; i += 2) {
    // Calculate the bit index (0 to 2047)
    const bitIndex = ((hash[i]! << 8) | hash[i + 1]!) & 0x7ff

    // Check if that bit is set in the 256-byte bloom array
    const byteIndex = 255 - Math.floor(bitIndex / 8)
    const bitMask = 1 << (bitIndex % 8)

    if ((bloom[byteIndex]! & bitMask) === 0) {
      return false // Definitely NOT in this block
    }
  }
  return true // PROBABLY in this block (could be a false positive)
}

export function isBlockInteresting(bloomHex: Hex, addresses: Hex[], topics: Hex[]): boolean {
  // Check if ANY of our target contracts might be in this block
  const hasContract = addresses.some((addr) => isInBloom(bloomHex, addr))
  if (!hasContract) return false

  // Check if ANY of our target event signatures might be in this block
  const hasEvent = topics.some((topic) => isInBloom(bloomHex, topic))
  return hasEvent
}
