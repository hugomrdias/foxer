import { expect, test } from 'bun:test'

import { globalFlags } from '../src/bin/flags.ts'
import {
  MAX_BACKFILL_MEMORY_LIMIT_MB,
  MIN_BACKFILL_MEMORY_LIMIT_MB,
  resolveBackfillMemoryLimitBytes,
  resolveMaxConnections,
} from '../src/config.ts'

test('does not expose a configurable backfill write mode', () => {
  expect('backfillWriteMode' in globalFlags).toBe(false)
})

test('exposes only one backfill ingestion tuning flag', () => {
  expect('batchSize' in globalFlags).toBe(false)
  expect('backfillFetchConcurrency' in globalFlags).toBe(false)
  expect('backfillCopyChunkBytes' in globalFlags).toBe(false)
  expect('backfillMemoryLimitMb' in globalFlags).toBe(true)
  expect('default' in globalFlags.backfillMemoryLimitMb).toBe(false)
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

test('defaults the backfill memory limit to 64 MiB', () => {
  expect(resolveBackfillMemoryLimitBytes(undefined, undefined)).toBe(
    64 * 1024 * 1024
  )
})

test('reads the backfill memory limit from env when the flag is unset', () => {
  expect(resolveBackfillMemoryLimitBytes(undefined, '32')).toBe(
    32 * 1024 * 1024
  )
})

test('prefers the CLI backfill memory limit over env', () => {
  expect(resolveBackfillMemoryLimitBytes(128, '32')).toBe(128 * 1024 * 1024)
})

test('rejects backfill memory limits outside the safe range', () => {
  expect(
    resolveBackfillMemoryLimitBytes(MIN_BACKFILL_MEMORY_LIMIT_MB, undefined)
  ).toBe(MIN_BACKFILL_MEMORY_LIMIT_MB * 1024 * 1024)
  expect(
    resolveBackfillMemoryLimitBytes(MAX_BACKFILL_MEMORY_LIMIT_MB, undefined)
  ).toBe(MAX_BACKFILL_MEMORY_LIMIT_MB * 1024 * 1024)
  expect(() =>
    resolveBackfillMemoryLimitBytes(MIN_BACKFILL_MEMORY_LIMIT_MB - 1, undefined)
  ).toThrow()
  expect(() =>
    resolveBackfillMemoryLimitBytes(MAX_BACKFILL_MEMORY_LIMIT_MB + 1, undefined)
  ).toThrow()
  expect(() => resolveBackfillMemoryLimitBytes(16.5, undefined)).toThrow()
})
