import type { JsonRpcId, JsonRpcRequest, JsonRpcResponse } from './types.ts'

/**
 * Checks whether an unknown body has the minimum JSON-RPC request shape.
 */
export function isRequest(body: unknown): body is JsonRpcRequest {
  if (!body || typeof body !== 'object') return false
  const request = body as JsonRpcRequest
  return (
    request.jsonrpc === '2.0' &&
    typeof request.method === 'string' &&
    request.method.length > 0 &&
    request.method.length <= 128 &&
    (request.params === undefined || Array.isArray(request.params)) &&
    (request.id === undefined ||
      request.id === null ||
      typeof request.id === 'string' ||
      (typeof request.id === 'number' && Number.isFinite(request.id)))
  )
}

/**
 * Builds a successful JSON-RPC 2.0 response envelope.
 */
export function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

/**
 * Builds an error JSON-RPC 2.0 response envelope.
 */
export function error(
  id: JsonRpcId,
  code: number,
  message: string,
  data?: unknown
): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id,
    error: data === undefined ? { code, message } : { code, message, data },
  }
}
