import { handleJsonRpcFailure } from '../src/api/json-rpc/errors.ts'
import type {
  JsonRpcErrorResponse,
  JsonRpcId,
  JsonRpcRequest,
} from '../src/api/json-rpc/types.ts'

export const testLogger = {
  debug: () => undefined,
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
} as never

export function handleTestJsonRpcFailure(
  cause: unknown,
  args: {
    id: JsonRpcId
    request?: Pick<JsonRpcRequest, 'method' | 'params'>
  }
): JsonRpcErrorResponse {
  return handleJsonRpcFailure(cause, {
    ...args,
    logger: testLogger,
    maxConnections: 100,
  }).response
}
