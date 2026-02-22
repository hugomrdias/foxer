import { type AbiEvent, getAddress, type Log, type PublicClient } from 'viem'
import { filterContracts } from '../config/config.ts'
import { env } from '../config/env.ts'
import type { Database } from '../db/client.ts'
import { withTransaction } from '../db/transaction.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import { createComponentLogger } from '../logger.ts'
import { safeGetBlock } from '../rpc/block-fetcher.ts'
import type {
  BlockSimpleWithTransactions,
  InternalConfig,
  TransactionSimple,
} from '../utils/types.ts'
import { cacheBlockAndTransactions } from './cache.ts'
import { ensureParentContinuity } from './reorg.ts'

const logger = createComponentLogger('processBlock')

export type ProcessBlockResult =
  | { status: 'processed' }
  | { status: 'skipped_null_round' }
  | { status: 'reorg'; rewindTo: bigint }

/**
 * Processes one block: continuity check, event writes, and optional cursor update.
 */
export async function processBlock(args: {
  config: InternalConfig
  db: Database
  client: PublicClient
  hooks: HookRegistry<NonNullable<unknown>>
  blockNumber: bigint
  prefetchedLogs?: Log<bigint, number, false, AbiEvent>[]
  prefetchedBlock?: BlockSimpleWithTransactions
  skipParentContinuityCheck?: boolean
  disableTransaction?: boolean
}): Promise<ProcessBlockResult> {
  // console.time("processBlock");
  const {
    config,
    db,
    client,
    hooks,
    blockNumber,
    prefetchedBlock,
    prefetchedLogs,
  } = args
  const skipParentContinuityCheck = args.skipParentContinuityCheck ?? false
  const disableTransaction = args.disableTransaction ?? false
  let block: BlockSimpleWithTransactions
  const transactionByHash = new Map<`0x${string}`, TransactionSimple>()

  if (prefetchedBlock) {
    block = prefetchedBlock
  } else {
    const blockResult = await safeGetBlock(client, blockNumber)
    if (blockResult.status === 'null_round') {
      logger.debug(
        { blockNumber: blockNumber.toString() },
        'skipping null round block'
      )
      return { status: 'skipped_null_round' }
    }
    block = blockResult.block
  }
  for (const tx of block.transactions) {
    transactionByHash.set(tx.hash, tx)
  }
  // console.timeLog("processBlock", "getBlock");

  if (!skipParentContinuityCheck) {
    const rewindTo = await ensureParentContinuity({
      db,
      client,
      blockNumber,
      parentHash: block.parentHash,
    })
    if (rewindTo != null) {
      return { status: 'reorg', rewindTo }
    }
    // console.timeLog("processBlock", "ensureParentContinuity");
  }

  const { eventAbis, addresses } = filterContracts(
    config,
    blockNumber,
    blockNumber
  )
  const logs = prefetchedLogs
    ? prefetchedLogs
    : await client.getLogs({
        address: addresses,
        events: eventAbis,
        fromBlock: blockNumber,
        toBlock: blockNumber,
      })
  // console.timeLog("processBlock", "getLogs", logs.length);

  const write = async (tx: Database) => {
    await cacheBlockAndTransactions({
      db: tx,
      block,
    })
    // console.timeLog("processBlock", "cacheBlockAndTransactions");
    // if (logsToCache) {
    //   await cacheLogsForBlock({
    //     db: tx,
    //     blockNumber,
    //     logs: logsToCache,
    //   });
    // }

    for (const log of logs) {
      const contractName = config.contractNameByAddress[getAddress(log.address)]
      const eventName = log.eventName
      const transaction = transactionByHash.get(log.transactionHash)
      if (!transaction) {
        logger.warn(
          { transactionHash: log.transactionHash },

          'transaction not found in block transaction list'
        )
        continue
      }
      await hooks.dispatch({
        key: `${contractName}:${eventName}` as never,
        args: log.args as never,
        log: log as never,
        block,
        transaction,
        context: {
          db: tx,
          chainId: BigInt(env.CHAIN_ID),
          blockNumber,
        },
      })
    }
  }

  if (disableTransaction) {
    await write(db)
  } else {
    await withTransaction(db, write)
  }

  // console.timeEnd("processBlock");
  return { status: 'processed' }
}
