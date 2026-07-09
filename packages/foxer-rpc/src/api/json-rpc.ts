import { and, asc, eq, gte, inArray, lte, type SQL, sql } from 'drizzle-orm'
import type { Hex } from 'viem'

import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import { schema } from '../db/schema/index.ts'
import { hexToBytes } from '../utils/hex.ts'
import {
  decodeBlock,
  decodeLog,
  decodeReceipt,
  decodeTransaction,
  quantity,
} from './decode.ts'

type JsonRpcId = string | number | null
type JsonRpcRequest = {
  jsonrpc?: string
  id?: JsonRpcId
  method?: string
  params?: unknown[]
}

type JsonRpcResponse =
  | { jsonrpc: '2.0'; id: JsonRpcId; result: unknown }
  | {
      jsonrpc: '2.0'
      id: JsonRpcId
      error: { code: number; message: string; data?: unknown }
    }

/**
 * Handles a JSON-RPC 2.0 request body.
 *
 * Both single requests and batches are supported. Empty batches and malformed
 * request objects are translated into standard JSON-RPC error responses instead
 * of throwing out to Hono.
 */
export function handleJsonRpc(args: {
  db: Database
  config: InternalConfig
  body: unknown
}): Promise<JsonRpcResponse | JsonRpcResponse[] | undefined> {
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
  args: { db: Database; config: InternalConfig },
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
        return ok(id, quantity(args.config.chainId))
      case 'net_version':
        return ok(id, String(args.config.chainId))
      case 'web3_clientVersion':
        return ok(id, 'foxer-rpc/0.0.0')
      case 'eth_blockNumber':
        return ok(id, await ethBlockNumber(args.db))
      case 'eth_getBlockByNumber':
        return ok(id, await ethGetBlockByNumber(args, params))
      case 'eth_getBlockByHash':
        return ok(id, await ethGetBlockByHash(args, params))
      case 'eth_getTransactionByHash':
        return ok(id, await ethGetTransactionByHash(args.db, params))
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
    return error(id, -32603, 'Internal error', cause)
  }
}

/**
 * Returns the latest locally indexed block number.
 */
async function ethBlockNumber(db: Database) {
  const latest = (await db.$prepared.getLatestBlock.execute())[0]?.number
  return latest == null ? quantity(0) : quantity(latest)
}

/**
 * Implements `eth_getBlockByNumber` from database rows.
 */
async function ethGetBlockByNumber(
  args: { db: Database; config: InternalConfig },
  params: unknown[]
) {
  const blockNumber = await resolveBlockNumber(args, params[0])
  if (blockNumber == null) return null
  const block = (
    await args.db.$prepared.getBlockByNumber.execute({ blockNumber })
  )[0]
  if (!block) return null
  return decodeBlockByRow(args.db, block, Boolean(params[1]))
}

/**
 * Implements `eth_getBlockByHash` from database rows.
 */
async function ethGetBlockByHash(args: { db: Database }, params: unknown[]) {
  const hash = requireHex(params[0], 'block hash')
  const block = (
    await args.db.$prepared.getBlockByHash.execute({ hash: hexToBytes(hash) })
  )[0]
  if (!block) return null
  return decodeBlockByRow(args.db, block, Boolean(params[1]))
}

/**
 * Loads a block's header, transactions, and logs, then builds the wire response.
 */
async function decodeBlockByRow(
  db: Database,
  block: typeof schema.blocks.$inferSelect,
  fullTransactions: boolean
) {
  const [transactions, logs] = await Promise.all([
    db.$prepared.getTransactionsByBlockNumber.execute({
      blockNumber: block.number,
    }),
    db.$prepared.getLogsByBlockNumber.execute({ blockNumber: block.number }),
  ])
  return decodeBlock(block, transactions, logs, fullTransactions)
}

/**
 * Implements `eth_getTransactionByHash` from the transaction primary key.
 */
async function ethGetTransactionByHash(db: Database, params: unknown[]) {
  const hash = requireHex(params[0], 'transaction hash')
  const [row] = await db
    .select({
      tx: schema.transactions,
      block: schema.blocks,
    })
    .from(schema.transactions)
    .innerJoin(
      schema.blocks,
      eq(schema.transactions.blockNumber, schema.blocks.number)
    )
    .where(sql`${schema.transactions.hash} = ${hexToBytes(hash)}`)
    .limit(1)
  if (!row) return null
  return decodeTransaction(row.tx, row.block)
}

/**
 * Implements `eth_getTransactionByBlockNumberAndIndex`.
 */
async function ethGetTransactionByBlockNumberAndIndex(
  args: { db: Database; config: InternalConfig },
  params: unknown[]
) {
  const blockNumber = await resolveBlockNumber(args, params[0])
  if (blockNumber == null) return null
  return getTransactionByBlockNumberAndIndex(args.db, blockNumber, params[1])
}

/**
 * Implements `eth_getTransactionByBlockHashAndIndex`.
 */
async function ethGetTransactionByBlockHashAndIndex(
  args: { db: Database },
  params: unknown[]
) {
  const hash = requireHex(params[0], 'block hash')
  const block = (
    await args.db.$prepared.getBlockByHash.execute({ hash: hexToBytes(hash) })
  )[0]
  if (!block) return null
  return getTransactionByBlockNumberAndIndex(args.db, block.number, params[1])
}

/**
 * Loads a transaction by canonical block position and decodes it.
 */
async function getTransactionByBlockNumberAndIndex(
  db: Database,
  blockNumber: bigint,
  index: unknown
) {
  const transactionIndex = requireQuantityNumber(index, 'index')
  const [tx, block] = await Promise.all([
    db.$prepared.getTransactionByBlockNumberAndIndex.execute({
      blockNumber,
      transactionIndex,
    }),
    db.$prepared.getBlockByNumber.execute({ blockNumber }),
  ])
  if (!tx[0] || !block[0]) return null
  return decodeTransaction(tx[0], block[0])
}

/**
 * Implements `eth_getBlockTransactionCountByNumber`.
 */
async function ethGetBlockTransactionCountByNumber(
  args: { db: Database; config: InternalConfig },
  params: unknown[]
) {
  const blockNumber = await resolveBlockNumber(args, params[0])
  if (blockNumber == null) return null
  const count = (
    await args.db.$prepared.getTransactionCountByBlockNumber.execute({
      blockNumber,
    })
  )[0]?.count
  return quantity(count ?? 0)
}

/**
 * Implements `eth_getBlockTransactionCountByHash`.
 */
async function ethGetBlockTransactionCountByHash(
  db: Database,
  params: unknown[]
) {
  const hash = requireHex(params[0], 'block hash')
  const block = (
    await db.$prepared.getBlockByHash.execute({ hash: hexToBytes(hash) })
  )[0]
  if (!block) return null
  const count = (
    await db.$prepared.getTransactionCountByBlockNumber.execute({
      blockNumber: block.number,
    })
  )[0]?.count
  return quantity(count ?? 0)
}

/**
 * Implements `eth_getTransactionReceipt`.
 */
async function ethGetTransactionReceipt(db: Database, params: unknown[]) {
  const hash = requireHex(params[0], 'transaction hash')
  const tx = (
    await db.$prepared.getTransactionByHash.execute({ hash: hexToBytes(hash) })
  )[0]
  if (!tx) return null
  const [block, logs] = await Promise.all([
    db.$prepared.getBlockByNumber.execute({ blockNumber: tx.blockNumber }),
    db.$prepared.getLogsByTransactionPosition.execute({
      blockNumber: tx.blockNumber,
      transactionIndex: tx.transactionIndex,
    }),
  ])
  if (!block[0]) return null
  return decodeReceipt(tx, block[0], logs)
}

/**
 * Implements `eth_getBlockReceipts` by grouping block logs per transaction.
 */
async function ethGetBlockReceipts(
  args: { db: Database; config: InternalConfig },
  params: unknown[]
) {
  const blockNumber = await resolveBlockNumber(args, params[0])
  if (blockNumber == null) return null
  const [block, transactions, logs] = await Promise.all([
    args.db.$prepared.getBlockByNumber.execute({ blockNumber }),
    args.db.$prepared.getTransactionsByBlockNumber.execute({ blockNumber }),
    args.db.$prepared.getLogsByBlockNumber.execute({ blockNumber }),
  ])
  if (!block[0]) return null
  const logsByTransactionIndex = new Map<number, typeof logs>()
  for (const log of logs) {
    const transactionLogs = logsByTransactionIndex.get(log.transactionIndex)
    if (transactionLogs) {
      transactionLogs.push(log)
    } else {
      logsByTransactionIndex.set(log.transactionIndex, [log])
    }
  }

  return transactions.map((tx) =>
    decodeReceipt(
      tx,
      block[0],
      logsByTransactionIndex.get(tx.transactionIndex) ?? []
    )
  )
}

/**
 * Implements capped `eth_getLogs` over the compact log table.
 *
 * The query always has a bounded block range and ordered `(blockNumber,
 * logIndex)` result. Address and topic filters are translated into SQL
 * predicates, with topic1-topic3 applied as residual filters when Postgres uses
 * the range/address/topic0 access paths.
 */
async function ethGetLogs(
  args: { db: Database; config: InternalConfig },
  params: unknown[]
) {
  const filter = (params[0] ?? {}) as {
    fromBlock?: unknown
    toBlock?: unknown
    blockHash?: unknown
    address?: unknown
    topics?: unknown[]
  }

  if (
    filter.blockHash != null &&
    (filter.fromBlock != null || filter.toBlock != null)
  ) {
    throw new RpcError(
      -32602,
      'blockHash cannot be combined with fromBlock/toBlock'
    )
  }

  const conditions: SQL[] = []
  let fromBlock: bigint
  let toBlock: bigint

  if (filter.blockHash == null) {
    fromBlock =
      (await resolveBlockNumber(args, filter.fromBlock ?? 'latest')) ?? 0n
    toBlock = (await resolveBlockNumber(args, filter.toBlock ?? 'latest')) ?? 0n
  } else {
    const blockHash = requireHex(filter.blockHash, 'block hash')
    const block = (
      await args.db.$prepared.getBlockByHash.execute({
        hash: hexToBytes(blockHash),
      })
    )[0]
    if (!block) return []
    fromBlock = block.number
    toBlock = block.number
  }

  if (toBlock < fromBlock) return []
  if (toBlock - fromBlock > args.config.maxLogsBlockRange) {
    throw new RpcError(-32005, 'eth_getLogs block range too large', {
      maxBlockRange: args.config.maxLogsBlockRange.toString(),
    })
  }

  conditions.push(gte(schema.logs.blockNumber, fromBlock))
  conditions.push(lte(schema.logs.blockNumber, toBlock))

  addAddressFilter(conditions, filter.address)
  addTopicFilters(conditions, filter.topics)

  const rows = await args.db
    .select({
      log: schema.logs,
      block: schema.blocks,
      tx: schema.transactions,
    })
    .from(schema.logs)
    .innerJoin(schema.blocks, eq(schema.logs.blockNumber, schema.blocks.number))
    .innerJoin(
      schema.transactions,
      and(
        eq(schema.logs.blockNumber, schema.transactions.blockNumber),
        eq(schema.logs.transactionIndex, schema.transactions.transactionIndex)
      )
    )
    .where(and(...conditions))
    .orderBy(asc(schema.logs.blockNumber), asc(schema.logs.logIndex))
    .limit(args.config.maxLogsResultRows + 1)

  if (rows.length > args.config.maxLogsResultRows) {
    throw new RpcError(-32005, 'eth_getLogs result set too large', {
      maxRows: args.config.maxLogsResultRows,
    })
  }

  return rows.map((row) => decodeLog(row.log, row.block, row.tx))
}

/**
 * Adds an address predicate for `eth_getLogs`.
 *
 * Ethereum allows either a single address or an OR-list of addresses.
 */
function addAddressFilter(conditions: SQL[], value: unknown) {
  if (value == null) return
  if (Array.isArray(value)) {
    const addresses = value.map((item) => requireHex(item, 'address'))
    if (addresses.length === 0) {
      conditions.push(sql`false`)
      return
    }
    conditions.push(inArray(schema.logs.address, addresses))
    return
  }
  conditions.push(eq(schema.logs.address, requireHex(value, 'address')))
}

/**
 * Adds positional topic predicates for `eth_getLogs`.
 *
 * Each topic position can be `null` as a wildcard, one topic, or an OR-list of
 * topics. Empty OR-lists intentionally become `false` predicates.
 */
function addTopicFilters(conditions: SQL[], topics: unknown[] | undefined) {
  if (!topics) return
  const columns = [
    schema.logs.topic0,
    schema.logs.topic1,
    schema.logs.topic2,
    schema.logs.topic3,
  ]

  for (const [index, topic] of topics.entries()) {
    if (topic == null) continue
    const column = columns[index]
    if (!column) continue
    if (Array.isArray(topic)) {
      const topicValues = topic.map((item) => requireHex(item, 'topic'))
      if (topicValues.length === 0) {
        conditions.push(sql`false`)
        continue
      }
      conditions.push(inArray(column, topicValues))
      continue
    }
    conditions.push(eq(column, requireHex(topic, 'topic')))
  }
}

/**
 * Resolves Ethereum block tags and hex quantities into local block heights.
 */
async function resolveBlockNumber(
  args: { db: Database },
  value: unknown
): Promise<bigint | null> {
  if (
    value == null ||
    value === 'latest' ||
    value === 'safe' ||
    value === 'finalized' ||
    value === 'pending'
  ) {
    return (await args.db.$prepared.getLatestBlock.execute())[0]?.number ?? null
  }
  if (value === 'earliest') return 0n
  if (typeof value === 'string' && value.startsWith('0x')) {
    return requireQuantity(value, 'block parameter')
  }
  throw new RpcError(-32602, 'invalid block parameter')
}

/**
 * Validates an Ethereum JSON-RPC quantity and returns it as a bigint.
 *
 * Quantities are not arbitrary hex strings: zero is `0x0`, non-zero values must
 * not have leading zeroes, and an empty `0x` is invalid.
 */
function requireQuantity(value: unknown, name: string): bigint {
  if (
    typeof value !== 'string' ||
    !/^0x(?:0|[1-9a-fA-F][0-9a-fA-F]*)$/.test(value)
  ) {
    throw new RpcError(-32602, `invalid ${name}`)
  }
  return BigInt(value)
}

function requireQuantityNumber(value: unknown, name: string): number {
  const quantityValue = requireQuantity(value, name)
  if (quantityValue > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RpcError(-32602, `invalid ${name}`)
  }
  return Number(quantityValue)
}

/**
 * Validates and normalizes an expected hex string parameter.
 */
function requireHex(value: unknown, name: string): Hex {
  if (typeof value !== 'string' || !value.startsWith('0x')) {
    throw new RpcError(-32602, `invalid ${name}`)
  }
  return value.toLowerCase() as Hex
}

/**
 * Checks whether an unknown body has the minimum JSON-RPC request shape.
 */
function isRequest(body: unknown): body is JsonRpcRequest {
  if (!body || typeof body !== 'object') return false
  const request = body as JsonRpcRequest
  return request.jsonrpc === '2.0' && typeof request.method === 'string'
}

/**
 * Builds a successful JSON-RPC 2.0 response envelope.
 */
function ok(id: JsonRpcId, result: unknown): JsonRpcResponse {
  return { jsonrpc: '2.0', id, result }
}

/**
 * Builds an error JSON-RPC 2.0 response envelope.
 */
function error(
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

/**
 * Error type for expected JSON-RPC method failures.
 *
 * Throwing this from a handler preserves the JSON-RPC error code and optional
 * data payload while keeping unexpected exceptions mapped to `-32603`.
 */
class RpcError extends Error {
  readonly code: number
  readonly data?: unknown

  constructor(code: number, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
  }
}
