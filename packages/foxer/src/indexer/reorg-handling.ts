import type { Logger } from 'pino'
import type { PublicClient } from 'viem'
import type { Database } from '../db/client.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import type { InternalConfig } from '../utils/types.ts'
import { processBlock } from './process-block.ts'

export type QueueBlockArgs = {
  logger: Logger
  blockNumber: bigint
  onRewind: (rewindTo: bigint) => void
  config: InternalConfig
  db: Database
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

  const start = Date.now()
  try {
    const result = await processBlock({
      config,
      db,
      client,
      registry,
      blockNumber,
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

    if (result.status === 'skipped_null_round') {
      logger.info(
        {
          blockNumber: blockNumber.toString(),
          queueSize,
        },
        'skipped null round block'
      )
      return
    }

    logger.info(
      {
        duration: Date.now() - start,
        blockNumber: blockNumber.toString(),
        queueSize,
      },
      'processed live block'
    )
  } catch (error) {
    logger.error(
      { err: error, blockNumber: blockNumber.toString() },
      'block processing failed; rewinding'
    )
    onRewind(blockNumber - 1n)
  }
}
