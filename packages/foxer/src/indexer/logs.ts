import type { AbiEvent, Address, Log, PublicClient } from 'viem'

export async function getLogsInRange(args: {
  client: PublicClient
  addresses: Address[]
  events: readonly AbiEvent[]
  fromBlock: bigint
  toBlock: bigint
}): Promise<Map<bigint, Log<bigint, number, false, AbiEvent>[]>> {
  const { client, addresses, events, fromBlock, toBlock } = args

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
  return logsByBlock
}
