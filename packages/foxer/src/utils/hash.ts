/**
 * Normalizes hash strings so comparisons are case-insensitive.
 */
export function normalizeHash(hash: string): string {
  return hash.toLowerCase()
}

/**
 * Compares two optional hash strings for equality.
 */
export function hashEquals(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  if (left == null || right == null) return left === right
  return normalizeHash(left) === normalizeHash(right)
}
