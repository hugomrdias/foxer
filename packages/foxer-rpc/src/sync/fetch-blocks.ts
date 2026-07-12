import type { InternalConfig } from '../config.ts'
import type { Database } from '../db/client.ts'
import { safeGetBlock } from '../rpc/get-block.ts'
import type { WeightedIndexedBlockData } from '../types.ts'

const MAX_FETCH_LOOKAHEAD = 8
const MIN_FETCH_RESERVATION_BYTES = 256 * 1024

type PendingResult = { value: WeightedIndexedBlockData } | { error: unknown }

export type OrderedBlockFetcher = {
  next: (bufferedBytes: number) => Promise<WeightedIndexedBlockData | null>
  readonly nextReservationBytes: number
  readonly peakInFlight: number
}

/**
 * Creates an ordered fetch scheduler whose lookahead adapts to retained bytes.
 *
 * The first request establishes a block-size reservation. Small observed blocks
 * allow more parallel lookahead; heavy blocks reduce it without an operator
 * concurrency setting. Completed out-of-order results remain bounded by the
 * same reservation calculation and the fixed lookahead ceiling.
 */
export function createOrderedBlockFetcher(args: {
  client: InternalConfig['clients']['backfill']
  db: Database
  fromBlock: bigint
  toBlock: bigint
  memoryLimitBytes: number
  onBlockReady?: (value: WeightedIndexedBlockData) => void
}): OrderedBlockFetcher {
  if (
    !Number.isSafeInteger(args.memoryLimitBytes) ||
    args.memoryLimitBytes <= 0
  ) {
    throw new Error('Backfill memory limit must be a positive safe integer')
  }

  const pending = new Map<bigint, Promise<PendingResult>>()
  let nextToSchedule = args.fromBlock
  let nextToRead = args.fromBlock
  let reservationBytes = args.memoryLimitBytes
  let observedBlocks = 0
  let failed = false
  let activeRequests = 0
  let peakInFlight = 0

  const schedule = (bufferedBytes: number) => {
    if (failed || nextToSchedule > args.toBlock) return

    const availableBytes = Math.max(args.memoryLimitBytes - bufferedBytes, 0)
    const target = Math.max(
      1,
      Math.min(
        MAX_FETCH_LOOKAHEAD,
        Math.floor(availableBytes / reservationBytes)
      )
    )

    while (pending.size < target && nextToSchedule <= args.toBlock) {
      const blockNumber = nextToSchedule
      nextToSchedule += 1n
      activeRequests += 1
      peakInFlight = Math.max(peakInFlight, activeRequests)
      const request = safeGetBlock({
        client: args.client,
        blockNumber,
        db: args.db,
      })
        .then((value): PendingResult => {
          args.onBlockReady?.(value)
          return { value }
        })
        .catch((error): PendingResult => {
          failed = true
          return { error }
        })
        .finally(() => {
          activeRequests -= 1
        })
      pending.set(blockNumber, request)
    }
  }

  return {
    async next(bufferedBytes) {
      if (nextToRead > args.toBlock) return null
      schedule(bufferedBytes)
      const request = pending.get(nextToRead)
      if (!request) return null

      const result = await request
      pending.delete(nextToRead)
      if ('error' in result) throw result.error

      nextToRead += 1n
      const actualBytes = Math.max(
        MIN_FETCH_RESERVATION_BYTES,
        result.value.estimatedBytes
      )
      reservationBytes =
        observedBlocks === 0
          ? actualBytes
          : Math.max(actualBytes, Math.ceil(reservationBytes * 0.75))
      observedBlocks += 1
      return result.value
    },
    get nextReservationBytes() {
      return reservationBytes
    },
    get peakInFlight() {
      return peakInFlight
    },
  }
}
