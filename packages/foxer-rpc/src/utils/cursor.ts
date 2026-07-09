/**
 * Returns the inclusive end block for a fixed-size sync window.
 *
 * The result is capped at `max`, which lets backfill build batches without
 * overshooting the current safe head.
 */
export function windowEnd(start: bigint, size: bigint, max: bigint): bigint {
  const end = start + size - 1n
  return end <= max ? end : max
}
