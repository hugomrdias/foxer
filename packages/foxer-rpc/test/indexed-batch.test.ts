import { describe, expect, test } from 'bun:test'
import { insertIndexedBlockData } from '../src/db/actions.ts'
import {
  appendToBackfillBatch,
  consumeLogs,
  consumeTransactions,
  countBlocks,
  countLogs,
  countTransactions,
  createBackfillBatch,
  flattenBlocks,
  flattenLogs,
  flattenTransactions,
  iterateBlocks,
  iterateLogs,
  iterateTransactions,
} from '../src/db/indexed-batch.ts'
import type { EncodedLog, IndexedBlockData } from '../src/types.ts'
import {
  address,
  bytes32,
  emptyRoot,
  withTestDatabase,
  zeroLogsBloom,
} from './helpers.ts'

const RANGE_ERROR_REGRESSION_SIZE = 1_000_001

function sampleIndexedBlock(
  number: bigint,
  txCount = 1,
  logCount = 1
): IndexedBlockData {
  const transactions = Array.from({ length: txCount }, (_, index) => ({
    hash: hashFor(number + BigInt(index + 1_000_000)),
    blockNumber: number,
    transactionIndex: index,
    from: address('a'),
    to: address('b'),
    input: '0x' as const,
    value: 0n,
    nonce: 0,
    gas: 21_000n,
    gasPrice: 1n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    type: 2,
    v: 27n,
    r: bytes32('c'),
    s: bytes32('d'),
    accessList: null,
    status: 1,
    receiptGasUsed: 21_000n,
    cumulativeGasUsed: 21_000n,
    effectiveGasPrice: 1n,
    contractAddress: null,
    logsBloom: zeroLogsBloom,
  }))

  const logs = Array.from({ length: logCount }, (_, index) => ({
    blockNumber: number,
    logIndex: index,
    transactionIndex: 0,
    address: address('c'),
    topic0: bytes32('f'),
    topic1: null,
    topic2: null,
    topic3: null,
    data: '0xabcd' as const,
  }))

  return {
    block: {
      number,
      hash: hashFor(number),
      isNullRound: false,
      parentHash: hashFor(number - 1n),
      timestamp: number,
      miner: address('0'),
      gasUsed: 21_000n,
      gasLimit: 30_000_000n,
      baseFeePerGas: 1_000_000_000n,
      size: 1n,
      stateRoot: emptyRoot,
      receiptsRoot: emptyRoot,
      transactionsRoot: emptyRoot,
      extraData: '0x',
      logsBloom: zeroLogsBloom,
    },
    transactions,
    logs,
  }
}

function buildLargeBatch(blockCount: number): IndexedBlockData[] {
  const batch = new Array<IndexedBlockData>(blockCount)
  for (let i = 0; i < blockCount; i++) {
    batch[i] = sampleIndexedBlock(BigInt(i + 1))
  }
  return batch
}

describe('indexed batch utilities', () => {
  test('flattens logs beyond the Bun argument limit without RangeError', () => {
    const repeatedLog = sampleIndexedBlock(1n).logs[0]
    const markerLog = { ...repeatedLog, logIndex: 500_000 }
    const sourceLogs = new Array<EncodedLog>(RANGE_ERROR_REGRESSION_SIZE).fill(
      repeatedLog
    )
    sourceLogs[500_000] = markerLog
    const batch = [{ ...sampleIndexedBlock(1n, 0, 0), logs: sourceLogs }]
    let flattened: EncodedLog[] | undefined

    expect(() => {
      flattened = flattenLogs(batch)
    }).not.toThrow()

    expect(countLogs(batch)).toBe(RANGE_ERROR_REGRESSION_SIZE)
    expect(flattened?.length).toBe(RANGE_ERROR_REGRESSION_SIZE)
    expect(flattened?.[0]).toBe(repeatedLog)
    expect(flattened?.[500_000]).toBe(markerLog)
    expect(flattened?.[RANGE_ERROR_REGRESSION_SIZE - 1]).toBe(repeatedLog)
  })

  test('iterates rows in canonical order', () => {
    const batch = [sampleIndexedBlock(1n, 2, 2), sampleIndexedBlock(2n, 1, 3)]

    expect([...iterateBlocks(batch)].map((block) => block.number)).toEqual([
      1n,
      2n,
    ])
    expect(
      [...iterateTransactions(batch)].map((tx) => tx.transactionIndex)
    ).toEqual([0, 1, 0])
    expect([...iterateLogs(batch)].map((log) => log.logIndex)).toEqual([
      0, 1, 0, 1, 2,
    ])
  })

  test('flattens with exact preallocation equivalent to nested iteration', () => {
    const batch = [sampleIndexedBlock(10n, 2, 2), sampleIndexedBlock(11n, 1, 1)]

    const blocks = flattenBlocks(batch)
    const transactions = flattenTransactions(batch)
    const logs = flattenLogs(batch)

    expect(blocks).toEqual([...iterateBlocks(batch)])
    expect(transactions).toEqual([...iterateTransactions(batch)])
    expect(logs).toEqual([...iterateLogs(batch)])
    expect(blocks.length).toBe(countBlocks(batch))
    expect(transactions.length).toBe(countTransactions(batch))
    expect(logs.length).toBe(countLogs(batch))
  })

  test('tracks supplied weight without cloning row arrays', () => {
    const heavy = sampleIndexedBlock(2n, 1, 1_000)
    const transactions = heavy.transactions
    const logs = heavy.logs
    const batch = createBackfillBatch()

    appendToBackfillBatch(batch, heavy, 123)

    expect(batch.estimatedBytes).toBe(123)
    expect(batch.items).toHaveLength(1)
    expect(batch.items[0]).toBe(heavy)
    expect(batch.transactionCount).toBe(1)
    expect(batch.logCount).toBe(1_000)
    expect(heavy.transactions).toBe(transactions)
    expect(heavy.logs).toBe(logs)
    expect(heavy.transactions).toHaveLength(1)
    expect(heavy.logs).toHaveLength(1_000)
  })

  test('consuming iterators release each block array as streaming advances', () => {
    const first = sampleIndexedBlock(1n, 2, 2)
    const second = sampleIndexedBlock(2n, 1, 1)
    const items = [first, second]

    const transactions = consumeTransactions(items)
    expect(transactions.next().value?.transactionIndex).toBe(0)
    expect(transactions.next().value?.transactionIndex).toBe(1)
    expect(first.transactions).toHaveLength(2)
    expect(transactions.next().value?.transactionIndex).toBe(0)
    expect(first.transactions).toEqual([])
    expect(transactions.next().done).toBe(true)
    expect(second.transactions).toEqual([])

    const logs = consumeLogs(items)
    expect(logs.next().value?.logIndex).toBe(0)
    expect(logs.next().value?.logIndex).toBe(1)
    expect(first.logs).toHaveLength(2)
    expect(logs.next().value?.logIndex).toBe(0)
    expect(first.logs).toEqual([])
    expect(logs.next().done).toBe(true)
    expect(second.logs).toEqual([])
  })

  test('insert writer accepts large indexed batches without spread flattening', async () => {
    await withTestDatabase(async (db) => {
      const batch = buildLargeBatch(200)
      await expect(
        insertIndexedBlockData({ db, batch })
      ).resolves.toBeUndefined()
    })
  })
})

function hashFor(value: bigint) {
  return `0x${value.toString(16).padStart(64, '0')}` as const
}
