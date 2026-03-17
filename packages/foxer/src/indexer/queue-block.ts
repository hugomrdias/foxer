import type { Logger } from 'pino'
import type { PublicClient } from 'viem'

import { filterContracts, type InternalConfig } from '../config/config.ts'
import type { Database } from '../db/client.ts'
import type { relations, schema } from '../db/schema/index.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import { safeGetBlock } from '../rpc/get-block.ts'
import type { EncodedBlock, EncodedTransaction } from '../types.ts'
import { startClock } from '../utils/timer.ts'
import { processBlock } from './process-block.ts'

export type QueueBlockArgs = {
  logger: Logger
  blockNumber: bigint
  onRewind: (rewindTo: bigint) => void
  config: InternalConfig
  db: Database<typeof schema, typeof relations>
  client: PublicClient
  registry: HookRegistry
  queueSize: number
}

export async function queueBlock(args: QueueBlockArgs): Promise<void> {
  const {
    config,
    db,
    client,
    registry,
    blockNumber,
    logger,
    onRewind,
    queueSize,
  } = args

  const endClock = startClock()
  try {
    const contracts = filterContracts(config, blockNumber, blockNumber)

    const [blockResult, logsResult] = await Promise.all([
      safeGetBlock({ client, blockNumber, db }),
      client.getLogs({
        address: contracts.addresses,
        events: contracts.eventAbis,
        fromBlock: blockNumber,
        toBlock: blockNumber,
      }),
    ])

    const { transactions, ..._block } = blockResult
    const block: EncodedBlock = _block
    const transactionsMap = new Map<`0x${string}`, EncodedTransaction>()

    for (const tx of transactions) {
      transactionsMap.set(tx.hash, tx)
    }

    const result = await processBlock({
      logger,
      config,
      db,
      client,
      registry,
      type: 'live',
      contracts,
      block,
      transactionsMap,
      logs: logsResult,
    })

    if (result.status === 'reorg') {
      logger.warn(
        {
          blockNumber: blockNumber.toString(),
          rewindTo: result.rewindTo.toString(),
        },
        'reorg detected during live processing; rewinding'
      )
      onRewind(result.rewindTo)
      return
    }

    logger.info(
      {
        duration: endClock(),
        blockNumber: blockNumber.toString(),
        queueSize,
      },
      'processed live block'
    )
  } catch (error) {
    logger.error(
      { error, blockNumber: blockNumber.toString() },
      'block processing failed; rewinding'
    )
    onRewind(blockNumber - 1n)
  }
}
