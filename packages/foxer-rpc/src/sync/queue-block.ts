import type { PublicClient } from 'viem'

import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import { safeGetBlock } from '../rpc/get-block.ts'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'
import { processBlock } from './process-block.ts'

/**
 * Processes one live block from the p-queue.
 *
 * Any detected reorg is surfaced through `onRewind` so the queue owner can
 * reset its cursor and clear pending jobs. Unexpected failures rewind to the
 * previous block, allowing the next head notification to retry safely.
 */
export async function queueBlock(args: {
  logger: Logger
  blockNumber: bigint
  onRewind: (rewindTo: bigint) => void
  onSuccess?: (blockNumber: bigint) => void
  onFailure?: (blockNumber: bigint, error: unknown) => void
  config: InternalConfig
  db: Database
  client: PublicClient
  queueSize: number
}) {
  const { db, client, blockNumber, logger, onRewind, queueSize } = args
  const endClock = startClock()

  try {
    const getBlockClock = startClock()
    const weighted = await safeGetBlock({ client, blockNumber, db })
    logger.debug(
      {
        blockNumber: blockNumber.toString(),
        duration: getBlockClock(),
      },
      'fetched live block'
    )

    const processBlockClock = startClock()
    const result = await processBlock({
      logger,
      db,
      client,
      data: weighted.data,
    })
    logger.debug(
      {
        blockNumber: blockNumber.toString(),
        duration: processBlockClock(),
      },
      'processed live block data'
    )

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
    args.onSuccess?.(blockNumber)
  } catch (error) {
    args.onFailure?.(blockNumber, error)
    logger.error(
      { error, blockNumber: blockNumber.toString() },
      'block processing failed; rewinding'
    )
    onRewind(blockNumber)
  }
}
