import PQueue from 'p-queue'
import type { PublicClient } from 'viem'
import type { Database } from '../db/client.ts'
import type { HookRegistry } from '../hooks/registry.ts'
import { createComponentLogger } from '../logger.ts'
import { noop } from '../utils/common.ts'
import type { InternalConfig } from '../utils/types.ts'
import { queueBlock } from './reorg-handling.ts'

const log = createComponentLogger('live')

/**
 * Starts live head following and sequential block processing.
 */
export function startLiveSync(args: {
  config: InternalConfig
  db: Database
  client: PublicClient
  registry: HookRegistry
  initialCursor: bigint
}): { stop: () => void } {
  const { config, db, client, registry } = args

  // filter out contracts that have endBlock set
  const contracts = Object.values(config.contracts).filter(
    (contract) => contract.endBlock == null
  )

  if (contracts.length === 0) {
    log.info('all configured contracts have endBlock set; live sync disabled')
    return { stop: noop }
  }

  const pqueue = new PQueue({ concurrency: 1 })
  pqueue.on('error', (error) => {
    log.error({ err: error }, 'live queue error')
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
            logger: log,
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
      log.error({ err: error }, 'watchBlockNumber stream error')
    },
  })

  log.info(
    { startBlock: nextBlockToQueue.toString() },
    'watching latest chain head'
  )

  return { stop: unwatch }
}
