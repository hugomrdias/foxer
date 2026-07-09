/**
 * Error type for expected JSON-RPC method failures.
 *
 * Throwing this from a handler preserves the JSON-RPC error code and optional
 * data payload while keeping unexpected exceptions mapped to `-32603`.
 */
export class RpcError extends Error {
  readonly code: number
  readonly data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
  }
}
