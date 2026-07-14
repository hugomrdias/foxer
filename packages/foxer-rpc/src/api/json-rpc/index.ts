import { HttpRequestError, ResponseBodyTooLargeError, TimeoutError } from 'viem'

import { RpcError } from './errors.ts'
import { ethBlockNumber } from './methods/eth-block-number.ts'
import { ethChainId } from './methods/eth-chain-id.ts'
import { ethGetBlockByHash } from './methods/eth-get-block-by-hash.ts'
import { ethGetBlockByNumber } from './methods/eth-get-block-by-number.ts'
import { streamEthGetBlockReceipts } from './methods/eth-get-block-receipts-stream.ts'
import { ethGetBlockTransactionCountByHash } from './methods/eth-get-block-transaction-count-by-hash.ts'
import { ethGetBlockTransactionCountByNumber } from './methods/eth-get-block-transaction-count-by-number.ts'
import { streamEthGetLogs } from './methods/eth-get-logs-stream.ts'
import { ethGetTransactionByBlockHashAndIndex } from './methods/eth-get-transaction-by-block-hash-and-index.ts'
import { ethGetTransactionByBlockNumberAndIndex } from './methods/eth-get-transaction-by-block-number-and-index.ts'
import { ethGetTransactionByHash } from './methods/eth-get-transaction-by-hash.ts'
import { streamEthGetTransactionReceipt } from './methods/eth-get-transaction-receipt-stream.ts'
import { netVersion } from './methods/net-version.ts'
import { web3ClientVersion } from './methods/web3-client-version.ts'
import { error, ok } from './response.ts'
import type { JsonRpcMethodStream } from './stream.ts'
import {
  StreamCapacityExceededError,
  type StreamCapacityLimiter,
} from './stream-capacity.ts'
import type { JsonRpcRequest, JsonRpcResponse, MethodContext } from './types.ts'
import { requireHex, requireQuantity } from './validation.ts'

const PROXIED_METHODS = new Set([
  'debug_traceBlockByHash',
  'debug_traceBlockByNumber',
  'eth_call',
  'eth_estimateGas',
  'eth_feeHistory',
  'eth_gasPrice',
  'eth_getBalance',
  'eth_getCode',
  'eth_getProof',
  'eth_getStorageAt',
  'eth_getTransactionCount',
  'eth_maxPriorityFeePerGas',
  'eth_syncing',
])

/**
 * Handles one JSON-RPC request validated by the transport boundary.
 */
export function handleJsonRpc(
  args: MethodContext & { body: JsonRpcRequest }
): Promise<JsonRpcResponse> {
  return dispatch(args, args.body)
}

/**
 * Reports whether a validated request uses the streaming response transport.
 */
export function isStreamedRequest(body: JsonRpcRequest): boolean {
  switch (body.method) {
    case 'eth_getBlockReceipts':
    case 'eth_getLogs':
    case 'eth_getTransactionReceipt':
      return true
    default:
      return false
  }
}

/**
 * Dispatches one validated request through a method-facing JSON-RPC stream.
 */
export async function handleJsonRpcStream(
  args: MethodContext & {
    body: JsonRpcRequest
    stream: JsonRpcMethodStream
    streamCapacity: StreamCapacityLimiter
  }
) {
  const params = args.body.params ?? []

  try {
    switch (args.body.method) {
      case 'eth_getBlockReceipts':
        return await streamEthGetBlockReceipts(
          {
            config: args.config,
            db: args.db,
            streamCapacity: args.streamCapacity,
          },
          params,
          args.stream
        )
      case 'eth_getLogs':
        return await streamEthGetLogs(
          {
            config: args.config,
            db: args.db,
            streamCapacity: args.streamCapacity,
          },
          params,
          args.stream
        )
      case 'eth_getTransactionReceipt':
        return await streamEthGetTransactionReceipt(
          { db: args.db, streamCapacity: args.streamCapacity },
          params,
          args.stream
        )
      default:
        throw new Error(`JSON-RPC method is not streamed: ${args.body.method}`)
    }
  } catch (cause) {
    if (cause instanceof StreamCapacityExceededError) {
      args.logger.warn(
        {
          activeStreamConnections: cause.activeStreamConnections,
          maxConnections: args.config.maxConnections,
          maxStreamConnections: cause.maxStreamConnections,
          method: args.body.method,
          params,
          rejectionReason: 'stream_concurrency_limit',
        },
        'json-rpc stream rejected'
      )
    }
    throw cause
  }
}

/**
 * Routes one validated JSON-RPC request to its DB-backed method implementation.
 *
 * Method-specific validation errors are converted to JSON-RPC errors here so
 * every handler can use `RpcError` for client-facing failures and normal throws
 * for unexpected internal failures.
 */
async function dispatch(
  args: MethodContext,
  body: JsonRpcRequest
): Promise<JsonRpcResponse> {
  const id = body.id ?? null
  const params = body.params ?? []

  try {
    switch (body.method) {
      case 'eth_chainId':
        return ok(id, ethChainId(args))
      case 'net_version':
        return ok(id, netVersion(args))
      case 'web3_clientVersion':
        return ok(id, web3ClientVersion())
      case 'eth_blockNumber':
        return ok(id, await ethBlockNumber(args.db))
      case 'eth_getBlockByNumber':
        return ok(id, await ethGetBlockByNumber(args, params))
      case 'eth_getBlockByHash':
        return ok(id, await ethGetBlockByHash(args, params))
      case 'eth_getTransactionByHash':
        return ok(id, await ethGetTransactionByHash(args, params))
      case 'eth_getTransactionByBlockNumberAndIndex':
        return ok(
          id,
          await ethGetTransactionByBlockNumberAndIndex(args, params)
        )
      case 'eth_getTransactionByBlockHashAndIndex':
        return ok(id, await ethGetTransactionByBlockHashAndIndex(args, params))
      case 'eth_getBlockTransactionCountByNumber':
        return ok(id, await ethGetBlockTransactionCountByNumber(args, params))
      case 'eth_getBlockTransactionCountByHash':
        return ok(id, await ethGetBlockTransactionCountByHash(args.db, params))
      default:
        if (!PROXIED_METHODS.has(body.method)) {
          return error(id, -32601, 'Method not found')
        }
        validateProxiedRequest(body)
        return proxy(args, body)
    }
  } catch (cause) {
    if (cause instanceof RpcError) {
      return error(id, cause.code, cause.message, cause.data)
    }
    args.logger.error(
      { error: cause, method: body.method },
      'json-rpc internal error'
    )
    return error(id, -32603, 'Internal error')
  }
}

const TRACE_BLOCK_TAGS = new Set([
  'earliest',
  'finalized',
  'latest',
  'pending',
  'safe',
])

function validateProxiedRequest(body: JsonRpcRequest): void {
  if (
    body.method !== 'debug_traceBlockByNumber' &&
    body.method !== 'debug_traceBlockByHash'
  ) {
    return
  }

  const params = body.params ?? []
  if (params.length < 1 || params.length > 2) {
    throw new RpcError(-32602, 'invalid trace parameters')
  }

  if (body.method === 'debug_traceBlockByNumber') {
    if (!TRACE_BLOCK_TAGS.has(params[0] as string)) {
      requireQuantity(params[0], 'block parameter')
    }
  } else {
    requireHex(params[0], 'block hash', 32)
  }

  if (params.length === 2 && !isPlainObject(params[1])) {
    throw new RpcError(-32602, 'invalid trace options')
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const prototype = Object.getPrototypeOf(value)
  return prototype === Object.prototype || prototype === null
}

async function proxy(
  args: MethodContext,
  body: JsonRpcRequest
): Promise<JsonRpcResponse> {
  try {
    const result = await args.config.clients.proxy.request({
      method: body.method,
      params: body.params ?? [],
    } as never)
    return ok(body.id ?? null, result)
  } catch (cause) {
    if (isJsonRpcError(cause)) {
      return error(body.id ?? null, cause.code, cause.message, cause.data)
    }
    if (isUpstreamUnavailableError(cause)) {
      return error(body.id ?? null, -32002, 'Upstream RPC unavailable')
    }
    throw cause
  }
}

function isUpstreamUnavailableError(cause: unknown): boolean {
  return (
    cause instanceof HttpRequestError ||
    cause instanceof ResponseBodyTooLargeError ||
    cause instanceof TimeoutError
  )
}

function isJsonRpcError(
  cause: unknown
): cause is { code: number; message: string; data?: unknown } {
  return (
    cause != null &&
    typeof cause === 'object' &&
    typeof (cause as { code?: unknown }).code === 'number' &&
    typeof (cause as { message?: unknown }).message === 'string'
  )
}
