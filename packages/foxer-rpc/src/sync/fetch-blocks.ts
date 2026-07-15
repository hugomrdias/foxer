import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import { safeGetBlock } from '../rpc/get-block.ts'
import type { IndexedBlockData } from '../types.ts'

/**
 * Fetches a contiguous block range with bounded concurrency while preserving
 * canonical block order in preallocated result slots.
 */
export function fetchBlocksInOrder(args: {
  client: InternalConfig['clients']['backfill']
  db: Database
  fromBlock: bigint
  toBlock: bigint
  concurrency: number
}): Promise<IndexedBlockData[]> {
  if (!Number.isSafeInteger(args.concurrency) || args.concurrency <= 0) {
    throw new Error('Backfill concurrency must be a positive safe integer')
  }

  const count = Number(args.toBlock - args.fromBlock + 1n)
  if (count <= 0) {
    return Promise.resolve([])
  }

  const results = new Array<IndexedBlockData>(count)
  let nextIndex = 0
  let failed = false

  const worker = async () => {
    while (!failed) {
      const index = nextIndex
      if (index >= count) return
      nextIndex += 1

      try {
        results[index] = await safeGetBlock({
          client: args.client,
          blockNumber: args.fromBlock + BigInt(index),
          db: args.db,
        })
      } catch (error) {
        failed = true
        throw error
      }
    }
  }

  const workerCount = Math.min(args.concurrency, count)
  return Promise.all(Array.from({ length: workerCount }, worker)).then(
    () => results
  )
}
