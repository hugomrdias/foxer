/// <reference types="bun" />

import { afterEach, describe, expect, test } from 'bun:test'

import type { Database } from '../src/db/client.ts'
import { createRpcClients } from '../src/rpc/client.ts'
import { fetchBlocksInOrder } from '../src/sync/fetch-blocks.ts'
import { rpcBlock } from './rpc-fixtures.ts'
import { mockUpstreamRpc, type RpcRequest, upstreamRpcUrl } from './upstream.ts'

const active = { current: 0, max: 0 }

afterEach(() => {
  active.current = 0
  active.max = 0
})

describe('fetchBlocksInOrder', () => {
  test('returns ordered HTTP results with bounded concurrency', async () => {
    const blockCount = 12
    const concurrency = 3
    const completionOrder: bigint[] = []
    mockUpstreamRpc({
      eth_getBlockByNumber: async ({ params }: RpcRequest) => {
        const blockNumber = BigInt(String(params?.[0]))
        active.current += 1
        active.max = Math.max(active.max, active.current)
        await Bun.sleep((blockCount - Number(blockNumber - 100n)) * 5)
        completionOrder.push(blockNumber)
        active.current -= 1
        return rpcBlock(blockNumber)
      },
    })

    const results = await fetchBlocksInOrder({
      client: createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill,
      db: {} as Database,
      fromBlock: 100n,
      toBlock: 100n + BigInt(blockCount - 1),
      concurrency,
    })

    expect(results.map((item) => item.block.number)).toEqual(
      Array.from({ length: blockCount }, (_, index) => 100n + BigInt(index))
    )
    expect(active.max).toBe(concurrency)
    expect(completionOrder).not.toEqual(
      Array.from({ length: blockCount }, (_, index) => 100n + BigInt(index))
    )
  })

  test('rejects invalid concurrency before making HTTP requests', () => {
    const requests = mockUpstreamRpc({})
    const client = createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill
    for (const concurrency of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() =>
        fetchBlocksInOrder({
          client,
          db: {} as Database,
          fromBlock: 1n,
          toBlock: 1n,
          concurrency,
        })
      ).toThrow('Backfill fetch concurrency must be a positive safe integer')
    }
    expect(requests).toEqual([])
  })

  test('rejects promptly and stops workers from claiming more HTTP work', async () => {
    const claimed: bigint[] = []
    let activeHandlers = 0
    let releaseWorkers: () => void = () => undefined
    const workerGate = new Promise<void>((resolve) => {
      releaseWorkers = resolve
    })
    let initialBatchStarted: () => void = () => undefined
    const initialBatch = new Promise<void>((resolve) => {
      initialBatchStarted = resolve
    })
    let handlersDrained: () => void = () => undefined
    const drained = new Promise<void>((resolve) => {
      handlersDrained = resolve
    })
    const requests = mockUpstreamRpc({
      eth_getBlockByNumber: async ({ params }: RpcRequest) => {
        const blockNumber = BigInt(String(params?.[0]))
        claimed.push(blockNumber)
        activeHandlers += 1
        if (claimed.length === 3) initialBatchStarted()
        try {
          await initialBatch
          if (blockNumber === 100n) {
            return { error: { code: -32_000, message: 'upstream failure' } }
          }
          await workerGate
          return rpcBlock(blockNumber)
        } finally {
          activeHandlers -= 1
          if (activeHandlers === 0) handlersDrained()
        }
      },
    })

    const fetch = fetchBlocksInOrder({
      client: createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill,
      db: {} as Database,
      fromBlock: 100n,
      toBlock: 109n,
      concurrency: 3,
    })
    const timeout = Bun.sleep(100).then(() => {
      throw new Error('fetch did not reject promptly')
    })

    await expect(Promise.race([fetch, timeout])).rejects.toThrow(
      'upstream failure'
    )
    expect(claimed).toEqual([100n, 101n, 102n])
    expect(requests).toHaveLength(3)

    releaseWorkers()
    await drained
    expect(activeHandlers).toBe(0)
    expect(claimed).toEqual([100n, 101n, 102n])
    expect(requests).toHaveLength(3)
  })

  test('returns an empty array for an empty range without HTTP', async () => {
    const requests = mockUpstreamRpc({})
    const results = await fetchBlocksInOrder({
      client: createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill,
      db: {} as Database,
      fromBlock: 10n,
      toBlock: 9n,
      concurrency: 2,
    })

    expect(results).toEqual([])
    expect(requests).toEqual([])
  })
})
