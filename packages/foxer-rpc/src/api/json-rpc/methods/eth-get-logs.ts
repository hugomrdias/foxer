import { and, asc, eq, gte, inArray, lte, type SQL, sql } from 'drizzle-orm'

import { schema } from '../../../db/schema/index.ts'
import { hexToBytes } from '../../../utils/hex.ts'
import { decodeLog } from '../../decode.ts'
import { RpcError } from '../errors.ts'
import type { MethodContext } from '../types.ts'
import { requireHex, resolveBlockNumber } from '../validation.ts'

/**
 * Implements capped `eth_getLogs` over the compact log table.
 *
 * The query always has a bounded block range and ordered `(blockNumber,
 * logIndex)` result. Address and topic filters are translated into SQL
 * predicates, with topic1-topic3 applied as residual filters when Postgres uses
 * the range/address/topic0 access paths.
 */
export async function ethGetLogs(args: MethodContext, params: unknown[]) {
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
    const blockHash = requireHex(filter.blockHash, 'block hash', 32)
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
    const addresses = value.map((item) => requireHex(item, 'address', 20))
    if (addresses.length === 0) {
      conditions.push(sql`false`)
      return
    }
    conditions.push(inArray(schema.logs.address, addresses))
    return
  }
  conditions.push(eq(schema.logs.address, requireHex(value, 'address', 20)))
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
      const topicValues = topic.map((item) => requireHex(item, 'topic', 32))
      if (topicValues.length === 0) {
        conditions.push(sql`false`)
        continue
      }
      conditions.push(inArray(column, topicValues))
      continue
    }
    conditions.push(eq(column, requireHex(topic, 'topic', 32)))
  }
}
