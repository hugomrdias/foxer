import { calibration } from '@filoz/synapse-core/chains'
import { createPublicClient, http } from 'viem'

const client = createPublicClient({
  chain: calibration,
  transport: http(process.env.RPC_LIVE_URL),
})

const result = await client.getBlock({
  blockNumber: 3499102n,
})

console.log(result)

// const result2 = await client.getBlock({
//   blockNumber: 3499103n,
// })

// console.log(result2)

const result3 = await client.getBlock({
  blockNumber: 3499104n,
})

console.log(result3)

const logs = await client.getLogs({
  fromBlock: 3499103n,
  toBlock: 3499103n,
})

console.log(logs)
