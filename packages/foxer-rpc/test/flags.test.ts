import { expect, test } from 'bun:test'

import { globalFlags } from '../src/bin/flags.ts'
import {
  resolveBackfillCopyChunkBytes,
  resolveMaxConnections,
} from '../src/config.ts'
import { MAX_COPY_CHUNK_BYTES, MIN_COPY_CHUNK_BYTES } from '../src/db/copy.ts'

test('does not expose a configurable backfill write mode', () => {
  expect('backfillWriteMode' in globalFlags).toBe(false)
})

test('leaves backfill fetch concurrency unset for config precedence', () => {
  expect('default' in globalFlags.backfillFetchConcurrency).toBe(false)
})

test('leaves backfill copy chunk bytes unset for config precedence', () => {
  expect('default' in globalFlags.backfillCopyChunkBytes).toBe(false)
})

test('resolves and validates the API Postgres pool size', () => {
  expect('default' in globalFlags.maxConnections).toBe(false)
  expect(resolveMaxConnections(undefined, undefined)).toBe(100)
  expect(resolveMaxConnections(undefined, '12')).toBe(12)
  expect(resolveMaxConnections(8, '12')).toBe(8)
  expect(resolveMaxConnections(1, undefined)).toBe(1)
  expect(() => resolveMaxConnections(0, undefined)).toThrow()
  expect(() => resolveMaxConnections(3.5, undefined)).toThrow()
})

test('defaults backfill copy chunk bytes to 256 KiB', () => {
  expect(resolveBackfillCopyChunkBytes(undefined, undefined)).toBe(256 * 1024)
})

test('reads backfill copy chunk bytes from env when flag is unset', () => {
  expect(resolveBackfillCopyChunkBytes(undefined, '65536')).toBe(65_536)
})

test('prefers CLI backfill copy chunk bytes over env', () => {
  expect(resolveBackfillCopyChunkBytes(131_072, '65536')).toBe(131_072)
})

test('rejects backfill copy chunk bytes outside the safe range', () => {
  expect(resolveBackfillCopyChunkBytes(MIN_COPY_CHUNK_BYTES, undefined)).toBe(
    MIN_COPY_CHUNK_BYTES
  )
  expect(resolveBackfillCopyChunkBytes(MAX_COPY_CHUNK_BYTES, undefined)).toBe(
    MAX_COPY_CHUNK_BYTES
  )
  expect(() =>
    resolveBackfillCopyChunkBytes(undefined, String(MIN_COPY_CHUNK_BYTES - 1))
  ).toThrow()
  expect(() =>
    resolveBackfillCopyChunkBytes(undefined, String(MAX_COPY_CHUNK_BYTES + 1))
  ).toThrow()
  expect(() => resolveBackfillCopyChunkBytes(16_384.5, undefined)).toThrow()
})
