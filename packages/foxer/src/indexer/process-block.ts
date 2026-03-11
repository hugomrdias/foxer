import type { AbiEvent, Log, PublicClient } from 'viem'
import type { FilteredContracts, InternalConfig } from '../config/config.ts'
import { cacheBlockAndTransactions } from '../db/actions/blocks.ts'
import type { Database } from '../db/client.ts'
import type { relations, schema } from '../db/schema/index.ts'
import { withTransaction } from '../db/transaction.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import { safeGetBlock } from '../rpc/get-block.ts'
import type { EncodedBlockWithTransactions, EncodedTransaction } from '../types'
import type { Logger } from '../utils/logger.ts'
import { ensureParentContinuity } from './reorg.ts'

export type ProcessBlockResult =
  | { status: 'processed' }
  | { status: 'reorg'; rewindTo: bigint }

/**
 * Processes one block: continuity check, event writes, and optional cursor update.
 */
export async function processBlock(args: {
  logger: Logger
  config: InternalConfig
  db: Database<typeof schema, typeof relations>
  client: PublicClient
  registry: HookRegistry<NonNullable<unknown>>
  blockNumber: bigint
  logs?: Log<bigint, number, false, AbiEvent>[]
  block?: EncodedBlockWithTransactions
  type: 'backfill' | 'live'
  contracts: FilteredContracts
}): Promise<ProcessBlockResult> {
  const {
    logger,
    config,
    db,
    client,
    registry,
    blockNumber,
    block: prefetchedBlock,
    logs: prefetchedLogs,
    type,
    contracts,
  } = args
  const transactionByHash = new Map<`0x${string}`, EncodedTransaction>()

  let block: EncodedBlockWithTransactions | undefined
  let logs: Log<bigint, number, false, AbiEvent>[] | undefined

  if (prefetchedBlock) {
    block = prefetchedBlock
  }
  if (prefetchedLogs) {
    logs = prefetchedLogs
  }
  if (!block || !logs) {
    const [blockResult, logsResult] = await Promise.all([
      safeGetBlock({ client, blockNumber, db }),
      client.getLogs({
        address: contracts.addresses,
        events: contracts.eventAbis,
        fromBlock: blockNumber,
        toBlock: blockNumber,
      }),
    ])

    block = blockResult
    logs = logsResult
  }

  for (const tx of block.transactions) {
    transactionByHash.set(tx.hash, tx)
  }

  if (type === 'live') {
    const rewindTo = await ensureParentContinuity({
      logger,
      db,
      client,
      block,
    })
    if (rewindTo != null) {
      return { status: 'reorg', rewindTo }
    }
  }

  const write = async (tx: Database<typeof schema, typeof relations>) => {
    if (type === 'live') {
      await cacheBlockAndTransactions({
        db: tx,
        block,
        logger,
      })
    }

    for (const log of logs) {
      const contractName = contracts.contractNameByAddress[log.address]

      if (!contractName) {
        logger.trace(
          { address: log.address },
          'contract not found in contract name by address'
        )
        continue
      }
      const eventName = log.eventName

      if (!contracts.eventNames.has(eventName)) {
        continue
      }
      const transaction = transactionByHash.get(log.transactionHash)

      if (!transaction) {
        logger.trace(
          { transactionHash: log.transactionHash },

          'transaction not found in block transaction list'
        )
        continue
      }
      await registry.dispatch({
        key: `${contractName}:${eventName}` as never,
        args: log.args as never,
        log: log as never,
        block,
        transaction,
        context: {
          db: tx,
          chainId: config.client.chain.id,
          logger,
        },
      })
    }
  }

  if (type === 'backfill') {
    await write(db)
  } else {
    await withTransaction(db, write)
  }

  return { status: 'processed' }
}
