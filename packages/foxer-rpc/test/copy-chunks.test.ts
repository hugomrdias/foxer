import { describe, expect, test } from 'bun:test'
import { Writable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import {
  type CopyChunkStats,
  createCopyReadable,
  encodeBoundedBufferCopyChunks,
  encodeBoundedCopyChunks,
  encodeBoundedLogCopyChunks,
} from '../src/db/copy/chunks.ts'
import { DEFAULT_COPY_CHUNK_BYTES } from '../src/db/copy/constants.ts'
import {
  encodeBlockCopyRow,
  encodeCopyBytea,
  encodeCopyHeader,
  encodeCopyInt4,
  encodeCopyRow,
  encodeCopyTrailer,
  encodeTransactionCopyRow,
} from '../src/db/copy/protocol.ts'
import { iterateBlocks, iterateTransactions } from '../src/db/indexed-batch.ts'
import {
  concatCopyChunks,
  drainCopyChunks,
  encodeCopyChunks,
  encodeLogCopyRow,
  expectCompleteRowsInChunks,
  sampleBlock,
  sampleIndexedBatchEntry,
  sampleLog,
  sampleTransaction,
  toHex,
} from './copy-fixtures.ts'

const RANGE_ERROR_REGRESSION_SIZE = 1_000_001

describe('bounded COPY chunk streaming', () => {
  test('coalesces blocks and transactions without changing stream bytes', () => {
    const batch = Array.from({ length: 12 }, (_, index) => {
      const blockNumber = BigInt(index + 1)
      return sampleIndexedBatchEntry(sampleBlock(blockNumber), [
        sampleTransaction(blockNumber),
      ])
    })
    const chunkBytes = 2_048

    function expectCoalesced<T>(
      rows: () => Iterable<T>,
      encode: (row: T) => Buffer
    ) {
      const legacyChunks = [...encodeCopyChunks(rows(), encode)]
      const boundedChunks = [
        ...encodeBoundedBufferCopyChunks(rows(), encode, chunkBytes),
      ]
      expect(toHex(concatCopyChunks(boundedChunks))).toBe(
        toHex(concatCopyChunks(legacyChunks))
      )
      expect(boundedChunks.length).toBeLessThan(legacyChunks.length)
      expectCompleteRowsInChunks(boundedChunks, batch.length)
    }

    expectCoalesced(() => iterateBlocks(batch), encodeBlockCopyRow)
    expectCoalesced(() => iterateTransactions(batch), encodeTransactionCopyRow)
  })

  test('matches legacy byte stream for logs via the direct codec', () => {
    const logs = Array.from({ length: 32 }, (_, index) =>
      sampleLog(BigInt(index + 1))
    )
    const chunkBytes = 1_024

    const legacy = concatCopyChunks(encodeCopyChunks(logs, encodeLogCopyRow))
    const bounded = concatCopyChunks(
      encodeBoundedLogCopyChunks(logs, chunkBytes)
    )

    expect(toHex(bounded)).toBe(toHex(legacy))
  })

  test('emits header and trailer for empty input', () => {
    const bounded = concatCopyChunks(
      encodeBoundedBufferCopyChunks([], encodeBlockCopyRow, 256)
    )
    const legacy = concatCopyChunks(encodeCopyChunks([], encodeBlockCopyRow))

    expect(toHex(bounded)).toBe(toHex(legacy))
  })

  test('never splits rows across individual chunks', () => {
    const rows = Array.from({ length: 8 }, (_, index) =>
      encodeCopyRow([encodeCopyInt4(index)])
    )
    const chunkBytes = rows[0].length * 2 + encodeCopyHeader().length + 1

    const chunks = [
      ...encodeBoundedCopyChunks(
        rows.map((row) => ({
          size: row.length,
          write: (destination, offset) => {
            row.copy(destination, offset)
          },
        })),
        chunkBytes
      ),
    ]

    expectCompleteRowsInChunks(chunks, rows.length)
  })

  test('flushes exact-target chunks without copying their backing buffer', () => {
    const chunkBytes = 64
    const row = encodeCopyRow([
      Buffer.alloc(chunkBytes - encodeCopyHeader().length - 6),
    ])
    const chunks = [
      ...encodeBoundedBufferCopyChunks([row], (value) => value, chunkBytes),
    ]

    expect(chunks.map((chunk) => chunk.length)).toEqual([chunkBytes, 2])
    expect(chunks[0].buffer.byteLength).toBe(chunkBytes)
    expectCompleteRowsInChunks(chunks, 1)
  })

  test('copies partial chunks into exact-sized backing buffers', () => {
    const chunkBytes = 128
    const chunks = [
      ...encodeBoundedBufferCopyChunks(
        [encodeCopyRow([encodeCopyInt4(1)])],
        (value) => value,
        chunkBytes
      ),
    ]

    expect(chunks).toHaveLength(1)
    expect(chunks[0].length).toBeLessThan(chunkBytes)
    expect(chunks[0].buffer.byteLength).toBe(chunks[0].length)
  })

  test('emits oversized rows as their own chunk', () => {
    const oversized = encodeCopyRow([encodeCopyBytea(`0x${'ab'.repeat(900)}`)])
    const chunkBytes = 256
    const chunks = [
      ...encodeBoundedCopyChunks(
        [
          {
            size: oversized.length,
            write: (destination, offset) => {
              oversized.copy(destination, offset)
            },
          },
        ],
        chunkBytes
      ),
    ]

    expect(chunks.some((chunk) => chunk.length > chunkBytes)).toBe(true)
    expect(toHex(concatCopyChunks(chunks))).toBe(
      toHex(concatCopyChunks(encodeCopyChunks([0], () => oversized)))
    )
  })

  test('yields dramatically fewer chunks for 100k logs', () => {
    const logs = Array.from({ length: 100_000 }, (_, index) =>
      sampleLog(BigInt(index + 1))
    )
    const legacyChunks = [...encodeCopyChunks(logs, encodeLogCopyRow)]
    const boundedGenerator = encodeBoundedLogCopyChunks(
      logs,
      DEFAULT_COPY_CHUNK_BYTES
    )
    const { chunks: boundedChunks, stats } = drainCopyChunks(boundedGenerator)

    expect(legacyChunks.length).toBeGreaterThan(100_000)
    expect(boundedChunks).toHaveLength(78)
    expect(stats).toEqual({
      rows: 100_000,
      encodedBytes: 20_400_021,
      chunks: 78,
    })
    expect(toHex(concatCopyChunks(boundedChunks))).toBe(
      toHex(concatCopyChunks(legacyChunks))
    )
  })

  test('encodes rows lazily while chunks are consumed', () => {
    const encoded: number[] = []
    const rows = (function* () {
      for (let index = 0; index < 4; index += 1) {
        yield {
          size: 4,
          write: () => {
            encoded.push(index)
          },
        }
      }
    })()

    const chunks = encodeBoundedCopyChunks(rows, 32)
    expect(encoded).toEqual([])
    chunks.next()
    expect(encoded.length).toBeGreaterThan(0)
    expect(encoded.length).toBeLessThan(4)
    for (const _ of chunks) {
      // drain generator
    }
    expect(encoded).toEqual([0, 1, 2, 3])
  })

  test('uses byte-mode backpressure with a slow writable', async () => {
    const chunkBytes = 1_024
    const totalChunks = 50
    let produced = 0
    let consumed = 0
    let maxOutstanding = 0

    const source = createCopyReadable(
      (function* () {
        for (let index = 0; index < totalChunks; index += 1) {
          produced += 1
          maxOutstanding = Math.max(maxOutstanding, produced - consumed)
          yield Buffer.alloc(chunkBytes, index)
        }
      })(),
      chunkBytes
    )
    expect(source.readableObjectMode).toBe(false)
    expect(source.readableHighWaterMark).toBe(chunkBytes * 4)

    const destination = new Writable({
      highWaterMark: chunkBytes,
      write(_chunk, _encoding, callback) {
        setTimeout(() => {
          consumed += 1
          callback()
        }, 1)
      },
    })

    await pipeline(source, destination)
    expect(consumed).toBe(totalChunks)
    expect(maxOutstanding).toBeLessThanOrEqual(8)
    expect(maxOutstanding).toBeLessThan(totalChunks)
  })

  test('counts actual streamed framing bytes and chunks', () => {
    const row = encodeCopyRow([encodeCopyInt4(7)])
    const { chunks, stats } = drainCopyChunks(
      encodeBoundedBufferCopyChunks([row], (value) => value, 128)
    )

    expect(stats).toEqual({
      rows: 1,
      encodedBytes:
        encodeCopyHeader().length + row.length + encodeCopyTrailer().length,
      chunks: 1,
    })
    expect(stats.encodedBytes).toBe(Buffer.concat(chunks).length)
  })

  test('encodes 1,000,001 logs without stack overflow', () => {
    const logs = Array.from(
      { length: RANGE_ERROR_REGRESSION_SIZE },
      (_, index) => sampleLog(BigInt(index + 1))
    )
    const generator = encodeBoundedLogCopyChunks(logs, DEFAULT_COPY_CHUNK_BYTES)

    let stats: CopyChunkStats | undefined
    while (true) {
      const next = generator.next()
      if (next.done) {
        stats = next.value
        break
      }
    }

    expect(stats?.rows).toBe(RANGE_ERROR_REGRESSION_SIZE)
    expect(stats?.chunks).toBeGreaterThan(0)
  })
})
