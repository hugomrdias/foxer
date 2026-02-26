import PQueue from 'p-queue'
import { InternalRpcError, type PublicClient } from 'viem'
import type { InternalConfig } from '../config/config.ts'
import type { Database } from '../db/client.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import { noop } from '../utils/common.ts'
import type { Logger } from '../utils/logger.ts'
import { queueBlock } from './reorg-handling.ts'

/**
 * Starts live head following and sequential block processing.
 */
export function startLiveSync(args: {
  logger: Logger
  config: InternalConfig
  db: Database
  client: PublicClient
  registry: HookRegistry
  initialCursor: bigint
}): { stop: () => void } {
  const { config, db, client, registry, logger } = args

  // filter out contracts that have endBlock set
  const contracts = config.contractsForLive

  if (contracts.length === 0) {
    logger.debug(
      'all configured contracts have endBlock set; live sync disabled'
    )
    return { stop: noop }
  }

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
        pqueue.add(async () => {
          await queueBlock({
            logger,
            blockNumber,
            config,
            db,
            client,
            registry,
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

  logger.debug(
    { startBlock: nextBlockToQueue.toString() },
    'watching latest chain head'
  )

  return { stop: unwatch }
}
