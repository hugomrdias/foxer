import { describe, expect, test } from 'bun:test'

import {
  BatchRequestsUnsupportedError,
  handleJsonRpcFailure,
  InternalJsonRpcError,
  InvalidParamsError,
  InvalidRequestError,
  JsonRpcParseError,
  MethodNotFoundError,
  RequestBodyTooLargeError,
  StreamCapacityExceededError,
  UnsupportedContentTypeError,
} from '../src/api/json-rpc/errors.ts'

describe('JSON-RPC errors', () => {
  test('named protocol errors own their response code and HTTP status', () => {
    const cases = [
      {
        error: new JsonRpcParseError(new SyntaxError('invalid JSON')),
        code: -32700,
        message: 'Parse error',
        status: 200,
      },
      {
        error: new InvalidRequestError(),
        code: -32600,
        message: 'Invalid Request',
        status: 200,
      },
      {
        error: new BatchRequestsUnsupportedError(),
        code: -32600,
        message: 'Batch requests are not supported',
        status: 200,
      },
      {
        error: new RequestBodyTooLargeError(),
        code: -32600,
        message: 'Request body too large',
        status: 413,
      },
      {
        error: new UnsupportedContentTypeError(),
        code: -32600,
        message: 'Content-Type must be application/json',
        status: 415,
      },
      {
        error: new MethodNotFoundError(),
        code: -32601,
        message: 'Method not found',
        status: 200,
      },
      {
        error: new InvalidParamsError('invalid block parameter'),
        code: -32602,
        message: 'invalid block parameter',
        status: 200,
      },
    ]

    for (const item of cases) {
      expect(item.error).toMatchObject({
        code: item.code,
        httpStatus: item.status,
        name: item.error.constructor.name,
        responseMessage: item.message,
      })
    }
  })

  test('normalizes and logs an unknown failure once without exposing it', () => {
    const { calls, logger } = recordingLogger()
    const cause = new Error('database password leaked')
    const failure = handleJsonRpcFailure(cause, {
      id: 'request-1',
      logger,
      maxConnections: 100,
      request: { method: 'eth_call', params: [] },
    })

    expect(failure.error).toBeInstanceOf(InternalJsonRpcError)
    expect(failure.error.cause).toBe(cause)
    expect(failure.response).toEqual({
      jsonrpc: '2.0',
      id: 'request-1',
      error: { code: -32603, message: 'Internal error' },
    })
    expect(JSON.stringify(failure.response)).not.toContain('password')
    expect(calls).toEqual([
      {
        bindings: { error: failure.error, method: 'eth_call' },
        level: 'error',
        message: 'json-rpc internal error',
      },
    ])
  })

  test('logs stream-capacity context once at warn level', () => {
    const { calls, logger } = recordingLogger()
    const failure = handleJsonRpcFailure(
      new StreamCapacityExceededError({
        activeStreamConnections: 4,
        maxStreamConnections: 4,
      }),
      {
        id: 1,
        logger,
        maxConnections: 8,
        request: { method: 'eth_getLogs', params: [{}] },
      }
    )

    expect(failure.response).toMatchObject({
      error: {
        code: -32005,
        data: { maxConcurrentStreams: 4 },
      },
    })
    expect(calls).toEqual([
      {
        bindings: {
          activeStreamConnections: 4,
          maxConnections: 8,
          maxStreamConnections: 4,
          method: 'eth_getLogs',
          params: [{}],
          rejectionReason: 'stream_concurrency_limit',
        },
        level: 'warn',
        message: 'json-rpc stream rejected',
      },
    ])
  })
})

function recordingLogger() {
  const calls: {
    bindings: Record<string, unknown>
    level: 'error' | 'warn'
    message: string
  }[] = []
  return {
    calls,
    logger: {
      error(bindings: Record<string, unknown>, message: string) {
        calls.push({ bindings, level: 'error', message })
      },
      warn(bindings: Record<string, unknown>, message: string) {
        calls.push({ bindings, level: 'warn', message })
      },
    } as never,
  }
}
