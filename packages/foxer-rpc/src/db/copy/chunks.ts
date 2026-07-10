/**
 * Bounded COPY chunk generation and stream adapters.
 *
 * Keeps at most one reusable chunk buffer; direct log writers avoid intermediate row Buffers.
 */
import { Readable } from 'node:stream'

import type { EncodedLog } from '../../types.ts'
import { logCopyRowSize, writeLogCopyRow } from './log-codec.ts'
import { encodeCopyHeader, encodeCopyTrailer } from './protocol.ts'

/**
 * Row payload written directly into a bounded COPY chunk buffer.
 */
export type CopyRowWriter = {
  size: number
  write: (destination: Buffer, offset: number) => void
}

/**
 * Final COPY chunk generator statistics.
 */
export type CopyChunkStats = {
  rows: number
  encodedBytes: number
  chunks: number
}

/**
 * Per-table metrics collected while streaming a binary COPY payload.
 */
export type CopyTableMetrics = {
  rows: number
  encodedBytes: number
  chunks: number
  durationMs: number
  mbPerSec: number
  rowsPerSec: number
}

/**
 * Lazily yields bounded binary COPY chunks from pre-encoded row buffers.
 */
export function* encodeBoundedBufferCopyChunks<T>(
  rows: Iterable<T>,
  encodeRow: (row: T) => Buffer,
  chunkBytes: number
): Generator<Buffer, CopyChunkStats> {
  return yield* encodeBoundedCopyChunks(
    (function* () {
      for (const row of rows) {
        const encoded = encodeRow(row)
        yield {
          size: encoded.length,
          write: (destination, offset) => {
            encoded.copy(destination, offset)
          },
        }
      }
    })(),
    chunkBytes
  )
}

/**
 * Lazily yields bounded binary COPY chunks from direct row writers.
 */
export function* encodeBoundedCopyChunks(
  rows: Iterable<CopyRowWriter>,
  chunkBytes: number
): Generator<Buffer, CopyChunkStats> {
  const header = encodeCopyHeader()
  const trailer = encodeCopyTrailer()
  const stats: CopyChunkStats = { rows: 0, encodedBytes: 0, chunks: 0 }

  let buffer = Buffer.alloc(chunkBytes)
  let length = 0
  let headerPending = true

  const resetBuffer = () => {
    buffer = Buffer.alloc(chunkBytes)
    length = 0
  }

  const appendHeaderIfNeeded = () => {
    if (!headerPending) {
      return
    }

    header.copy(buffer, 0)
    length = header.length
    headerPending = false
  }

  const emit = function* (end: number) {
    if (end === 0) {
      return
    }

    stats.chunks += 1
    stats.encodedBytes += end
    if (end === buffer.length) {
      yield buffer
    } else {
      const chunk = Buffer.alloc(end)
      buffer.copy(chunk, 0, 0, end)
      yield chunk
    }
    resetBuffer()
  }

  for (const row of rows) {
    stats.rows += 1

    const rowLimit = headerPending ? chunkBytes - header.length : chunkBytes
    if (row.size > rowLimit) {
      if (length > 0) {
        yield* emit(length)
      }

      if (headerPending) {
        const oversized = Buffer.alloc(header.length + row.size)
        header.copy(oversized, 0)
        row.write(oversized, header.length)
        stats.chunks += 1
        stats.encodedBytes += oversized.length
        yield oversized
        headerPending = false
      } else {
        const oversized = Buffer.alloc(row.size)
        row.write(oversized, 0)
        stats.chunks += 1
        stats.encodedBytes += oversized.length
        yield oversized
      }

      continue
    }

    appendHeaderIfNeeded()

    if (length + row.size > chunkBytes) {
      yield* emit(length)
      appendHeaderIfNeeded()
    }

    row.write(buffer, length)
    length += row.size
  }

  appendHeaderIfNeeded()

  if (length + trailer.length <= chunkBytes) {
    trailer.copy(buffer, length)
    length += trailer.length
    yield* emit(length)
  } else if (
    length > header.length ||
    (length > 0 && headerPending === false)
  ) {
    yield* emit(length)
    stats.chunks += 1
    stats.encodedBytes += trailer.length
    yield trailer
  } else {
    trailer.copy(buffer, length)
    length += trailer.length
    yield* emit(length)
  }

  return stats
}

/**
 * Lazily yields bounded binary COPY chunks for log rows using the direct codec.
 */
export function* encodeBoundedLogCopyChunks(
  rows: Iterable<EncodedLog>,
  chunkBytes: number
): Generator<Buffer, CopyChunkStats> {
  return yield* encodeBoundedCopyChunks(
    (function* () {
      for (const log of rows) {
        yield {
          size: logCopyRowSize(log),
          write: (destination, offset) => {
            writeLogCopyRow(log, destination, offset)
          },
        }
      }
    })(),
    chunkBytes
  )
}

function copyStreamHighWaterMark(chunkBytes: number): number {
  return chunkBytes * 4
}

/**
 * Creates finite per-table throughput metrics from streamed COPY statistics.
 */
export function createCopyTableMetrics(
  stats: CopyChunkStats,
  durationMs: number
): CopyTableMetrics {
  const seconds = durationMs / 1000
  const mbPerSec =
    seconds > 0 ? stats.encodedBytes / (1024 * 1024) / seconds : 0
  const rowsPerSec = seconds > 0 ? stats.rows / seconds : 0

  return {
    rows: stats.rows,
    encodedBytes: stats.encodedBytes,
    chunks: stats.chunks,
    durationMs,
    mbPerSec,
    rowsPerSec,
  }
}

/**
 * Creates a byte-mode readable with a bounded high-water mark.
 */
export function createCopyReadable(
  chunks: Iterable<Buffer>,
  chunkBytes: number
): Readable {
  return Readable.from(chunks, {
    objectMode: false,
    highWaterMark: copyStreamHighWaterMark(chunkBytes),
  })
}
