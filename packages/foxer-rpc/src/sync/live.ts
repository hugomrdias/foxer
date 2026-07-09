import PQueue from 'p-queue'
import type { PublicClient } from 'viem'

import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import type { Logger } from '../utils/logger.ts'
import { queueBlock } from './queue-block.ts'

/**
 * Follows the latest chain head and queues every missing block in order.
 *
 * The queue has concurrency 1 so live processing is strictly sequential; this
 * makes parent-continuity checks and reorg rewinds deterministic. When a reorg
 * is reported, pending work is cleared and the queue cursor is moved back to the
 * rewind block.
 */
export function startLiveSync(args: {
  logger: Logger
  config: InternalConfig
  db: Database
  client: PublicClient
  initialCursor: bigint
}): { stop: () => void } {
  const { config, db, client, logger } = args
  const pqueue = new PQueue({ concurrency: 1 })

  pqueue.on('error', (error) => {
    logger.error({ error }, 'live queue error')
  })

  let nextBlockToQueue = args.initialCursor

  const unwatch = client.watchBlockNumber({
    emitMissed: true,
    emitOnBegin: true,
    onBlockNumber: (head) => {
      while (nextBlockToQueue <= head) {
        const blockNumber = nextBlockToQueue
        void pqueue.add(async () => {
          await queueBlock({
            logger,
            blockNumber,
            config,
            db,
            client,
            queueSize: pqueue.size,
            onRewind: (rewindTo) => {
              nextBlockToQueue = rewindTo
              pqueue.clear()
            },
          })
        })
        nextBlockToQueue += 1n
      }
    },
    onError: (error) => {
      logger.error({ error }, 'watchBlockNumber stream error')
    },
  })

  logger.info(
    { startBlock: nextBlockToQueue.toString() },
    'watching latest chain head'
  )

  return { stop: unwatch }
}
