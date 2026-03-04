import type { AbiEvent, Address, Log, PublicClient } from 'viem'
import type { Logger } from '../utils/logger.ts'
import { startClock } from '../utils/timer.ts'

export async function getLogsInRange(args: {
  logger: Logger
  client: PublicClient
  addresses: Address[]
  events: readonly AbiEvent[]
  fromBlock: bigint
  toBlock: bigint
}): Promise<Map<bigint, Log<bigint, number, false, AbiEvent>[]>> {
  const { logger, client, addresses, events, fromBlock, toBlock } = args

  // console.log('🚀 ~ getLogsInRange ~ events:', events)

  const endClock = startClock()

  const logsByBlock = new Map<bigint, Log<bigint, number, false, AbiEvent>[]>()
  const logs = await client.getLogs({
    address: addresses,
    events: events,
    fromBlock: fromBlock,
    toBlock: toBlock,
  })

  for (const log of logs) {
    const byBlock = logsByBlock.get(log.blockNumber) ?? []
    byBlock.push(log)
    logsByBlock.set(log.blockNumber, byBlock)
  }
  logger.info(
    {
      logs: logsByBlock.size,
      duration: endClock(),
    },
    'get logs'
  )
  return logsByBlock
}
