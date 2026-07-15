import { expect, test } from 'bun:test'

import { globalFlags } from '../src/bin/flags.ts'
import {
  resolveBackfillConcurrency,
  resolveMaxConnections,
  resolveMaxStreamConnections,
} from '../src/config.ts'

test('does not expose a configurable backfill write mode', () => {
  expect('backfillWriteMode' in globalFlags).toBe(false)
})

test('exposes only one backfill ingestion tuning flag', () => {
  expect('batchSize' in globalFlags).toBe(false)
  expect('backfillFetchConcurrency' in globalFlags).toBe(false)
  expect('backfillCopyChunkBytes' in globalFlags).toBe(false)
  expect('backfillMemoryLimitMb' in globalFlags).toBe(false)
  expect('backfillConcurrency' in globalFlags).toBe(true)
  expect('default' in globalFlags.backfillConcurrency).toBe(false)
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

test('reserves 20 API connections from streams by default', () => {
  expect('default' in globalFlags.maxStreamConnections).toBe(false)
  expect(resolveMaxStreamConnections(undefined, undefined, 100)).toBe(80)
  expect(resolveMaxStreamConnections(undefined, undefined, 90)).toBe(70)
  expect(resolveMaxStreamConnections(undefined, undefined, 10)).toBe(1)
})

test('resolves and validates the streamed Postgres connection limit', () => {
  expect(resolveMaxStreamConnections(undefined, '60', 90)).toBe(60)
  expect(resolveMaxStreamConnections(50, '60', 90)).toBe(50)
  expect(resolveMaxStreamConnections(1, undefined, 90)).toBe(1)
  expect(() => resolveMaxStreamConnections(0, undefined, 90)).toThrow()
  expect(() => resolveMaxStreamConnections(91, undefined, 90)).toThrow(
    'MAX_STREAM_CONNECTIONS cannot exceed MAX_CONNECTIONS'
  )
  expect(() => resolveMaxStreamConnections(3.5, undefined, 90)).toThrow()
})

test('defaults backfill concurrency to 20', () => {
  expect(resolveBackfillConcurrency(undefined, undefined)).toBe(20)
})

test('reads backfill concurrency from env when the flag is unset', () => {
  expect(resolveBackfillConcurrency(undefined, '12')).toBe(12)
})

test('prefers CLI backfill concurrency over env', () => {
  expect(resolveBackfillConcurrency(8, '12')).toBe(8)
})

test('rejects invalid backfill concurrency', () => {
  expect(resolveBackfillConcurrency(1, undefined)).toBe(1)
  expect(() => resolveBackfillConcurrency(0, undefined)).toThrow()
  expect(() => resolveBackfillConcurrency(-1, undefined)).toThrow()
  expect(() => resolveBackfillConcurrency(1.5, undefined)).toThrow()
})
