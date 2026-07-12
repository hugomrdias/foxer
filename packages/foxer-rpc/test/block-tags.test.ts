import { describe, expect, test } from 'bun:test'

import { ethGetBlockByNumber } from '../src/api/json-rpc/methods/eth-get-block-by-number.ts'
import { resolveBlockNumber } from '../src/api/json-rpc/validation.ts'
import { schema } from '../src/db/schema/index.ts'
import { blockRow } from './fixtures/receipts.ts'
import { bytes32, testLogger, withTestDatabase } from './helpers.ts'

describe('block tag resolution', () => {
  test('resolves available, head, and finality-based tags', async () => {
    await withTestDatabase(async (db) => {
      await db
        .insert(schema.blocks)
        .values([
          blockRow(10n, bytes32('a'), bytes32('0')),
          blockRow(15n, bytes32('b'), bytes32('a')),
          blockRow(20n, bytes32('c'), bytes32('b')),
        ])
      const args = { config: { finality: 5n }, db }

      await expect(resolveBlockNumber(args, 'earliest')).resolves.toBe(10n)
      await expect(resolveBlockNumber(args, 'latest')).resolves.toBe(20n)
      await expect(resolveBlockNumber(args, 'pending')).resolves.toBe(20n)
      await expect(resolveBlockNumber(args, 'safe')).resolves.toBe(15n)
      await expect(resolveBlockNumber(args, 'finalized')).resolves.toBe(15n)
      await expect(resolveBlockNumber(args, '0x7b')).resolves.toBe(123n)

      await expect(
        resolveBlockNumber({ config: { finality: 50n }, db }, 'finalized')
      ).resolves.toBe(10n)

      const block = await ethGetBlockByNumber(
        {
          config: { chainId: 314_159, finality: 5n },
          db,
          logger: testLogger,
        } as never,
        ['safe', false]
      )
      expect(block).toMatchObject({ number: '0xf', hash: bytes32('b') })
    })
  })

  test('returns null for tags when no blocks are available', async () => {
    await withTestDatabase(async (db) => {
      const args = { config: { finality: 5n }, db }
      await expect(resolveBlockNumber(args, 'earliest')).resolves.toBeNull()
      await expect(resolveBlockNumber(args, 'latest')).resolves.toBeNull()
      await expect(resolveBlockNumber(args, 'safe')).resolves.toBeNull()
    })
  })
})
