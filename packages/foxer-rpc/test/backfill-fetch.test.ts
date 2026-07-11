/// <reference types="bun" />

import { afterEach, describe, expect, mock, test } from 'bun:test'

import type { Database } from '../src/db/client.ts'
import type { IndexedBlockData } from '../src/types.ts'
import { zeroLogsBloom } from './helpers.ts'

const active = { current: 0, max: 0 }

afterEach(() => {
  active.current = 0
  active.max = 0
  mock.restore()
})

describe('fetchBlocksInOrder', () => {
  test('returns ordered results with bounded concurrency', async () => {
    const blockCount = 12
    const concurrency = 3
    const completionOrder: bigint[] = []
    const delays = new Map(
      Array.from({ length: blockCount }, (_, index) => [
        index,
        (blockCount - index) * 5,
      ])
    )

    mock.module('../src/rpc/get-block.ts', () => ({
      safeGetBlock: async ({
        blockNumber,
      }: {
        blockNumber: bigint
      }): Promise<IndexedBlockData> => {
        active.current += 1
        active.max = Math.max(active.max, active.current)

        const index = Number(blockNumber - 100n)
        await Bun.sleep(delays.get(index) ?? 0)
        completionOrder.push(blockNumber)
        active.current -= 1

        return sampleIndexedBlock(blockNumber)
      },
    }))

    const { fetchBlocksInOrder } = await import('../src/sync/fetch-blocks.ts')
    const results = await fetchBlocksInOrder({
      client: {} as never,
      db: {} as Database,
      fromBlock: 100n,
      toBlock: 100n + BigInt(blockCount - 1),
      concurrency,
    })

    expect(results).toHaveLength(blockCount)
    expect(results.map((item) => item.block.number)).toEqual(
      Array.from({ length: blockCount }, (_, index) => 100n + BigInt(index))
    )
    expect(active.max).toBeLessThanOrEqual(concurrency)
    expect(active.max).toBeGreaterThan(1)
    expect(completionOrder).not.toEqual(
      Array.from({ length: blockCount }, (_, index) => 100n + BigInt(index))
    )
    expect(completionOrder[0]).toBe(102n)
  })

  test('rejects invalid concurrency before starting workers', async () => {
    let fetchCalls = 0
    mock.module('../src/rpc/get-block.ts', () => ({
      safeGetBlock: () => {
        fetchCalls += 1
        return Promise.resolve(sampleIndexedBlock(0n))
      },
    }))

    const { fetchBlocksInOrder } = await import('../src/sync/fetch-blocks.ts')
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
          client: {} as never,
          db: {} as Database,
          fromBlock: 1n,
          toBlock: 1n,
          concurrency,
        })
      ).toThrow('Backfill fetch concurrency must be a positive safe integer')
    }
    expect(fetchCalls).toBe(0)
  })

  test('rejects promptly and stops workers from claiming more jobs', async () => {
    const failure = new Error('upstream failure')
    const claimed: bigint[] = []
    let activeWorkers = 0
    let releaseWorkers: () => void = () => undefined
    const workerGate = new Promise<void>((resolve) => {
      releaseWorkers = resolve
    })

    mock.module('../src/rpc/get-block.ts', () => ({
      safeGetBlock: async ({
        blockNumber,
      }: {
        blockNumber: bigint
      }): Promise<IndexedBlockData> => {
        claimed.push(blockNumber)
        activeWorkers += 1
        try {
          if (blockNumber === 100n) {
            await Bun.sleep(5)
            throw failure
          }
          await workerGate
          return sampleIndexedBlock(blockNumber)
        } finally {
          activeWorkers -= 1
        }
      },
    }))

    const { fetchBlocksInOrder } = await import('../src/sync/fetch-blocks.ts')
    const fetch = fetchBlocksInOrder({
      client: {} as never,
      db: {} as Database,
      fromBlock: 100n,
      toBlock: 109n,
      concurrency: 3,
    })
    const timeout = Bun.sleep(100).then(() => {
      throw new Error('fetch did not reject promptly')
    })

    await expect(Promise.race([fetch, timeout])).rejects.toBe(failure)
    expect(claimed).toEqual([100n, 101n, 102n])

    releaseWorkers()
    await Bun.sleep(10)
    expect(activeWorkers).toBe(0)
    expect(claimed).toEqual([100n, 101n, 102n])
  })

  test('returns an empty array for an empty range', async () => {
    mock.module('../src/rpc/get-block.ts', () => ({
      safeGetBlock: async () => sampleIndexedBlock(0n),
    }))

    const { fetchBlocksInOrder } = await import('../src/sync/fetch-blocks.ts')
    const results = await fetchBlocksInOrder({
      client: {} as never,
      db: {} as Database,
      fromBlock: 10n,
      toBlock: 9n,
      concurrency: 2,
    })

    expect(results).toEqual([])
  })
})

function sampleIndexedBlock(number: bigint): IndexedBlockData {
  return {
    block: {
      number,
      hash: `0x${number.toString(16).padStart(64, '0')}`,
      isNullRound: false,
      parentHash: `0x${(number - 1n).toString(16).padStart(64, '0')}`,
      timestamp: number,
      miner: `0x${'0'.repeat(40)}`,
      gasUsed: 0n,
      gasLimit: 0n,
      baseFeePerGas: null,
      size: 0n,
      stateRoot:
        '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      receiptsRoot:
        '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      transactionsRoot:
        '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421',
      extraData: '0x',
      logsBloom: zeroLogsBloom,
    },
    transactions: [],
    logs: [],
  }
}
