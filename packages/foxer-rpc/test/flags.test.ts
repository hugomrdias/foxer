/// <reference types="bun" />

import { expect, test } from 'bun:test'

import { globalFlags } from '../src/bin/flags.ts'
import { resolveBackfillCopyChunkBytes } from '../src/config.ts'
import { MAX_COPY_CHUNK_BYTES, MIN_COPY_CHUNK_BYTES } from '../src/db/copy.ts'

test('leaves backfill fetch concurrency unset for config precedence', () => {
  expect('default' in globalFlags.backfillFetchConcurrency).toBe(false)
})

test('leaves backfill copy chunk bytes unset for config precedence', () => {
  expect('default' in globalFlags.backfillCopyChunkBytes).toBe(false)
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
