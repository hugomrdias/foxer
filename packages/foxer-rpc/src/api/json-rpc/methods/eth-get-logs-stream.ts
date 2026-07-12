import {
  and,
  asc,
  desc,
  eq,
  gt,
  gte,
  inArray,
  lte,
  or,
  type SQL,
  sql,
} from 'drizzle-orm'

import type { InternalConfig } from '../../../config.ts'
import type { Database } from '../../../db/client.ts'
import { schema } from '../../../db/schema/index.ts'
import { decodeLog } from '../../decode.ts'
import { RpcError } from '../errors.ts'
import type { JsonRpcMethodStream } from '../stream.ts'
import { requireHex, resolveBlockNumber } from '../validation.ts'
import {
  LOG_STREAM_BATCH_SIZE,
  LogStreamSession,
} from './log-stream-session.ts'

type LogFilter = {
  fromBlock?: unknown
  toBlock?: unknown
  blockHash?: unknown
  address?: unknown
  topics?: unknown[]
}

/** Streams filtered logs in canonical `(blockNumber, logIndex)` order. */
export async function streamEthGetLogs(
  args: { config: InternalConfig; db: Database },
  params: unknown[],
  stream: JsonRpcMethodStream,
  options: { batchSize?: number } = {}
) {
  const filter = (params[0] ?? {}) as LogFilter
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
  addAddressFilter(conditions, filter.address)
  addTopicFilters(conditions, filter.topics)
  const blockHash =
    filter.blockHash == null
      ? undefined
      : requireHex(filter.blockHash, 'block hash', 32)

  const session = await LogStreamSession.open(
    args.db,
    options.batchSize ?? LOG_STREAM_BATCH_SIZE
  )
  stream.beforeFinish(() => session.commit())
  stream.onError(() => session.rollback())

  let fromBlock: bigint
  let toBlock: bigint
  if (blockHash) {
    const block = (
      await session.db
        .select({ number: schema.blocks.number })
        .from(schema.blocks)
        .where(eq(schema.blocks.hash, blockHash))
        .orderBy(asc(schema.blocks.isNullRound), desc(schema.blocks.number))
        .limit(1)
    )[0]
    if (!block) {
      await stream.resultArray(() => undefined)
      return
    }
    fromBlock = block.number
    toBlock = block.number
  } else {
    fromBlock =
      (await resolveBlockNumber(
        { config: args.config, db: session.db },
        filter.fromBlock ?? 'latest'
      )) ?? 0n
    toBlock =
      (await resolveBlockNumber(
        { config: args.config, db: session.db },
        filter.toBlock ?? 'latest'
      )) ?? 0n
  }

  if (toBlock < fromBlock) {
    await stream.resultArray(() => undefined)
    return
  }
  if (toBlock - fromBlock > args.config.maxLogsBlockRange) {
    throw new RpcError(-32005, 'eth_getLogs block range too large', {
      maxBlockRange: args.config.maxLogsBlockRange.toString(),
    })
  }

  conditions.push(gte(schema.logs.blockNumber, fromBlock))
  conditions.push(lte(schema.logs.blockNumber, toBlock))
  await streamLogs(session, conditions, stream)
}

async function streamLogs(
  session: LogStreamSession,
  conditions: SQL[],
  stream: JsonRpcMethodStream
) {
  await stream.resultArray(async (output) => {
    let lastBlockNumber: bigint | undefined
    let lastLogIndex = -1

    while (true) {
      const cursor =
        lastBlockNumber === undefined
          ? undefined
          : or(
              gt(schema.logs.blockNumber, lastBlockNumber),
              and(
                eq(schema.logs.blockNumber, lastBlockNumber),
                gt(schema.logs.logIndex, lastLogIndex)
              )
            )
      const rows = await session.db
        .select({
          log: schema.logs,
          block: { hash: schema.blocks.hash },
          tx: { hash: schema.transactions.hash },
        })
        .from(schema.logs)
        .innerJoin(
          schema.blocks,
          eq(schema.logs.blockNumber, schema.blocks.number)
        )
        .innerJoin(
          schema.transactions,
          and(
            eq(schema.logs.blockNumber, schema.transactions.blockNumber),
            eq(
              schema.logs.transactionIndex,
              schema.transactions.transactionIndex
            )
          )
        )
        .where(and(...conditions, cursor))
        .orderBy(asc(schema.logs.blockNumber), asc(schema.logs.logIndex))
        .limit(session.batchSize)

      if (rows.length === 0) return
      for (const row of rows) {
        await output.value(decodeLog(row.log, row.block, row.tx))
      }

      const last = rows.at(-1)
      if (!last) return
      lastBlockNumber = last.log.blockNumber
      lastLogIndex = last.log.logIndex
      if (rows.length < session.batchSize) return
    }
  })
}

function addAddressFilter(conditions: SQL[], value: unknown) {
  if (value == null) return
  if (Array.isArray(value)) {
    const addresses = value.map((item) => requireHex(item, 'address', 20))
    conditions.push(
      addresses.length === 0
        ? sql`false`
        : inArray(schema.logs.address, addresses)
    )
    return
  }
  conditions.push(eq(schema.logs.address, requireHex(value, 'address', 20)))
}

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
      conditions.push(
        topicValues.length === 0 ? sql`false` : inArray(column, topicValues)
      )
      continue
    }
    conditions.push(eq(column, requireHex(topic, 'topic', 32)))
  }
}
