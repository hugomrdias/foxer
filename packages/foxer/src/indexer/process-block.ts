import { type AbiEvent, getAddress, type Log, type PublicClient } from 'viem'
import {
  type FilteredContracts,
  filterContracts,
  type InternalConfig,
} from '../config/config.ts'
import type { Database } from '../db/client.ts'
import { withTransaction } from '../db/transaction.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import { safeGetBlock } from '../rpc/block-fetcher.ts'
import type { EncodedBlockWithTransactions, EncodedTransaction } from '../types'
import type { Logger } from '../utils/logger.ts'
import { cacheBlockAndTransactions } from './cache.ts'
import { ensureParentContinuity } from './reorg.ts'

export type ProcessBlockResult =
  | { status: 'processed' }
  | { status: 'skipped_null_round' }
  | { status: 'reorg'; rewindTo: bigint }

/**
 * Processes one block: continuity check, event writes, and optional cursor update.
 */
export async function processBlock(args: {
  logger: Logger
  config: InternalConfig
  db: Database
  client: PublicClient
  registry: HookRegistry<NonNullable<unknown>>
  blockNumber: bigint
  prefetchedLogs?: Log<bigint, number, false, AbiEvent>[]
  prefetchedBlock?: EncodedBlockWithTransactions
  skipParentContinuityCheck?: boolean
  disableTransaction?: boolean
  filteredContracts?: FilteredContracts
}): Promise<ProcessBlockResult> {
  const {
    logger,
    config,
    db,
    client,
    registry,
    blockNumber,
    prefetchedBlock,
    prefetchedLogs,
  } = args
  const skipParentContinuityCheck = args.skipParentContinuityCheck ?? false
  const disableTransaction = args.disableTransaction ?? false
  const transactionByHash = new Map<`0x${string}`, EncodedTransaction>()
  const filteredContracts =
    args.filteredContracts ?? filterContracts(config, blockNumber, blockNumber)
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
      safeGetBlock(client, blockNumber),
      client.getLogs({
        address: filteredContracts.addresses,
        events: filteredContracts.eventAbis,
        fromBlock: blockNumber,
        toBlock: blockNumber,
      }),
    ])
    if (blockResult.status === 'null_round') {
      logger.debug(
        { blockNumber: blockNumber.toString() },
        'skipping null round block'
      )
      return { status: 'skipped_null_round' }
    }
    block = blockResult.block
    logs = logsResult
  }

  for (const tx of block.transactions) {
    transactionByHash.set(tx.hash, tx)
  }

  if (!skipParentContinuityCheck) {
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

  const write = async (tx: Database) => {
    const persistPromise = cacheBlockAndTransactions({
      db: tx,
      block,
    })

    for (const log of logs) {
      const contractName =
        filteredContracts.contractNameByAddress[getAddress(log.address)]
      if (!contractName) {
        logger.warn(
          { address: log.address },
          'contract not found in contract name by address'
        )
        continue
      }
      const eventName = log.eventName
      if (!filteredContracts.eventNames.has(eventName)) {
        continue
      }
      const transaction = transactionByHash.get(log.transactionHash)
      if (!transaction) {
        logger.warn(
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
    await persistPromise
  }

  if (disableTransaction) {
    await write(db)
  } else {
    await withTransaction(db, write)
  }

  return { status: 'processed' }
}
