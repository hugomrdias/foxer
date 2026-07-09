import { RpcError } from './errors.ts'
import { ethBlockNumber } from './methods/eth-block-number.ts'
import { ethChainId } from './methods/eth-chain-id.ts'
import { ethGetBlockByHash } from './methods/eth-get-block-by-hash.ts'
import { ethGetBlockByNumber } from './methods/eth-get-block-by-number.ts'
import { ethGetBlockReceipts } from './methods/eth-get-block-receipts.ts'
import { ethGetBlockTransactionCountByHash } from './methods/eth-get-block-transaction-count-by-hash.ts'
import { ethGetBlockTransactionCountByNumber } from './methods/eth-get-block-transaction-count-by-number.ts'
import { ethGetLogs } from './methods/eth-get-logs.ts'
import { ethGetTransactionByBlockHashAndIndex } from './methods/eth-get-transaction-by-block-hash-and-index.ts'
import { ethGetTransactionByBlockNumberAndIndex } from './methods/eth-get-transaction-by-block-number-and-index.ts'
import { ethGetTransactionByHash } from './methods/eth-get-transaction-by-hash.ts'
import { ethGetTransactionReceipt } from './methods/eth-get-transaction-receipt.ts'
import { netVersion } from './methods/net-version.ts'
import { web3ClientVersion } from './methods/web3-client-version.ts'
import { error, isRequest, ok } from './response.ts'
import type { JsonRpcResponse, MethodContext } from './types.ts'

/**
 * Handles a JSON-RPC 2.0 request body.
 *
 * Both single requests and batches are supported. Empty batches and malformed
 * request objects are translated into standard JSON-RPC error responses instead
 * of throwing out to Hono.
 */
export function handleJsonRpc(
  args: MethodContext & { body: unknown }
): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
  if (Array.isArray(args.body)) {
    if (args.body.length === 0) {
      return Promise.resolve(error(null, -32600, 'Invalid Request'))
    }
    return Promise.all(
      args.body.map((request) => dispatch(args, request))
    ).then((responses) => {
      const filtered = responses.filter((response) => response != null)
      return filtered.length === 0 ? undefined : filtered
    })
  }

  return dispatch(args, args.body)
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
  body: unknown
): Promise<JsonRpcResponse | undefined> {
  if (!isRequest(body)) {
    return error(null, -32600, 'Invalid Request')
  }

  const isNotification = !Object.hasOwn(body, 'id')
  const id = body.id ?? null
  const params = body.params ?? []
  if (isNotification) return undefined

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
      case 'eth_getTransactionReceipt':
        return ok(id, await ethGetTransactionReceipt(args.db, params))
      case 'eth_getBlockReceipts':
        return ok(id, await ethGetBlockReceipts(args, params))
      case 'eth_getLogs':
        return ok(id, await ethGetLogs(args, params))
      default:
        return error(id, -32601, 'Method not found')
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
