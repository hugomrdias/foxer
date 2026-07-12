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
import type { JsonRpcRequest, JsonRpcResponse, MethodContext } from './types.ts'

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
export function handleJsonRpcStream(
  args: MethodContext & {
    body: JsonRpcRequest
    stream: JsonRpcMethodStream
  }
) {
  const params = args.body.params ?? []

  switch (args.body.method) {
    case 'eth_getBlockReceipts':
      return streamEthGetBlockReceipts({ db: args.db }, params, args.stream)
    case 'eth_getLogs':
      return streamEthGetLogs(
        { config: args.config, db: args.db },
        params,
        args.stream
      )
    case 'eth_getTransactionReceipt':
      return streamEthGetTransactionReceipt(
        { db: args.db },
        params,
        args.stream
      )
    default:
      throw new Error(`JSON-RPC method is not streamed: ${args.body.method}`)
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

async function proxy(
  args: MethodContext,
  body: JsonRpcRequest
): Promise<JsonRpcResponse> {
  try {
    const result = await args.config.clients.live.request({
      method: body.method,
      params: body.params ?? [],
    } as never)
    return ok(body.id ?? null, result)
  } catch (cause) {
    if (isJsonRpcError(cause)) {
      return error(body.id ?? null, cause.code, cause.message, cause.data)
    }
    throw cause
  }
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
