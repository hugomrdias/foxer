import { afterEach, describe, expect, test } from 'bun:test'

import type { Database } from '../src/db/client.ts'
import { createRpcClients } from '../src/rpc/client.ts'
import { createOrderedBlockFetcher } from '../src/sync/fetch-blocks.ts'
import { rpcBlock } from './rpc-fixtures.ts'
import { mockUpstreamRpc, type RpcRequest, upstreamRpcUrl } from './upstream.ts'

const active = { current: 0, max: 0 }

afterEach(() => {
  active.current = 0
  active.max = 0
})

describe('createOrderedBlockFetcher', () => {
  test('returns ordered HTTP results and adapts lookahead after the first block', async () => {
    const blockCount = 12
    const completionOrder: bigint[] = []
    const readyBlocks: bigint[] = []
    mockUpstreamRpc({
      eth_getBlockByNumber: async ({ params }: RpcRequest) => {
        const blockNumber = BigInt(String(params?.[0]))
        active.current += 1
        active.max = Math.max(active.max, active.current)
        await Bun.sleep((blockCount - Number(blockNumber - 100n)) * 2)
        completionOrder.push(blockNumber)
        active.current -= 1
        return rpcBlock(blockNumber)
      },
    })

    const fetcher = createOrderedBlockFetcher({
      client: createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill,
      db: {} as Database,
      fromBlock: 100n,
      toBlock: 100n + BigInt(blockCount - 1),
      memoryLimitBytes: 64 * 1024 * 1024,
      onBlockReady: ({ data }) => readyBlocks.push(data.block.number),
    })
    const results = []
    while (true) {
      const result = await fetcher.next(0)
      if (!result) break
      results.push(result)
    }

    expect(results.map(({ data }) => data.block.number)).toEqual(
      Array.from({ length: blockCount }, (_, index) => 100n + BigInt(index))
    )
    expect(active.max).toBeGreaterThan(1)
    expect(active.max).toBeLessThanOrEqual(8)
    expect(fetcher.peakInFlight).toBe(active.max)
    expect(completionOrder).not.toEqual(
      Array.from({ length: blockCount }, (_, index) => 100n + BigInt(index))
    )
    expect(readyBlocks.toSorted((a, b) => Number(a - b))).toEqual(
      Array.from({ length: blockCount }, (_, index) => 100n + BigInt(index))
    )
  })

  test('uses the memory reservation to stop increasing lookahead', async () => {
    mockUpstreamRpc({
      eth_getBlockByNumber: async ({ params }: RpcRequest) => {
        active.current += 1
        active.max = Math.max(active.max, active.current)
        await Bun.sleep(1)
        active.current -= 1
        return rpcBlock(BigInt(String(params?.[0])))
      },
    })

    const fetcher = createOrderedBlockFetcher({
      client: createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill,
      db: {} as Database,
      fromBlock: 1n,
      toBlock: 10n,
      memoryLimitBytes: 512 * 1024,
    })
    while (await fetcher.next(400 * 1024)) {
      // drain
    }

    expect(fetcher.peakInFlight).toBe(1)
  })

  test('rejects invalid memory limits before making HTTP requests', () => {
    const requests = mockUpstreamRpc({})
    const client = createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill
    for (const memoryLimitBytes of [
      0,
      -1,
      1.5,
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.MAX_SAFE_INTEGER + 1,
    ]) {
      expect(() =>
        createOrderedBlockFetcher({
          client,
          db: {} as Database,
          fromBlock: 1n,
          toBlock: 1n,
          memoryLimitBytes,
        })
      ).toThrow('Backfill memory limit must be a positive safe integer')
    }
    expect(requests).toEqual([])
  })

  test('stops scheduling new HTTP work after a failure', async () => {
    const claimed: bigint[] = []
    const readyBlocks: bigint[] = []
    const requests = mockUpstreamRpc({
      eth_getBlockByNumber: ({ params }: RpcRequest) => {
        const blockNumber = BigInt(String(params?.[0]))
        claimed.push(blockNumber)
        if (blockNumber === 2n) {
          return { error: { code: -32_000, message: 'upstream failure' } }
        }
        return rpcBlock(blockNumber)
      },
    })
    const fetcher = createOrderedBlockFetcher({
      client: createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill,
      db: {} as Database,
      fromBlock: 1n,
      toBlock: 20n,
      memoryLimitBytes: 64 * 1024 * 1024,
      onBlockReady: ({ data }) => readyBlocks.push(data.block.number),
    })

    await expect(fetcher.next(0)).resolves.toBeDefined()
    await expect(fetcher.next(0)).rejects.toThrow('upstream failure')
    expect(claimed.length).toBeLessThanOrEqual(9)
    expect(requests).toHaveLength(claimed.length)
    expect(readyBlocks).not.toContain(2n)
  })

  test('returns null for an empty range without HTTP', async () => {
    const requests = mockUpstreamRpc({})
    const fetcher = createOrderedBlockFetcher({
      client: createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill,
      db: {} as Database,
      fromBlock: 10n,
      toBlock: 9n,
      memoryLimitBytes: 64 * 1024 * 1024,
    })

    expect(await fetcher.next(0)).toBeNull()
    expect(requests).toEqual([])
  })
})
