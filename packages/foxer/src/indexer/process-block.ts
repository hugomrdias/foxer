import type { AbiEvent, Log, PublicClient } from 'viem'

import type { FilteredContracts, InternalConfig } from '../config/config.ts'
import { cacheBlockAndTransactions } from '../db/actions/blocks.ts'
import type { Database } from '../db/client.ts'
import type { relations, schema } from '../db/schema/index.ts'
import { withTransaction } from '../db/transaction.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import type { EncodedBlock, TransactionsMap } from '../types'
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
  logs: Log<bigint, number, false, AbiEvent>[]
  block: EncodedBlock
  transactionsMap: TransactionsMap
  type: 'backfill' | 'live'
  contracts: FilteredContracts
}): Promise<ProcessBlockResult> {
  const {
    logger,
    config,
    db,
    client,
    registry,
    block,
    transactionsMap,
    logs,
    type,
    contracts,
  } = args

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
        blocks: [block],
        transactions: Array.from(transactionsMap.values()),
        logger,
      })
    }

    for (const log of logs) {
      const contractName = contracts.contractNameByAddress[log.address]

      if (!contractName) {
        logger.debug(
          { address: log.address },
          'contract not found in contract name by address'
        )
        continue
      }
      const eventName = log.eventName

      if (!contracts.eventNames.has(eventName)) {
        continue
      }
      const transaction = transactionsMap.get(log.transactionHash)

      if (!transaction) {
        logger.debug(
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
