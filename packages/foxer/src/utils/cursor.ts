/**
 * Returns an inclusive window end, capped by a max block.
 */
export function windowEnd(start: bigint, size: bigint, max: bigint): bigint {
  const end = start + size - 1n
  return end <= max ? end : max
}
