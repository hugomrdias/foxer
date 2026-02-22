/**
 * Detects Filecoin null-round RPC errors so callers can skip non-existent rounds.
 */
export function isNullRoundRpcError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  if (message.includes('null round')) {
    return true
  }

  const details = (error as { details?: unknown }).details
  if (
    typeof details === 'string' &&
    details.toLowerCase().includes('null round')
  ) {
    return true
  }

  const cause = (error as { cause?: unknown }).cause
  if (cause && typeof cause === 'object') {
    const causeMessage = (cause as { message?: unknown }).message
    if (
      typeof causeMessage === 'string' &&
      causeMessage.toLowerCase().includes('null round')
    ) {
      return true
    }
  }

  return false
}
