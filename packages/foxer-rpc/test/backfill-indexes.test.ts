import { describe, expect, test } from 'bun:test'
import { sql } from 'drizzle-orm'

import type { InternalConfig } from '../src/config.ts'
import {
  anyManagedIndexMissing,
  dropManagedBackfillIndexes,
  getManagedIndexState,
  MANAGED_BACKFILL_INDEXES,
  managedIndexesExist,
  restoreManagedBackfillIndexes,
} from '../src/db/backfill-indexes.ts'
import type { Database } from '../src/db/client.ts'
import { schema } from '../src/db/schema/index.ts'
import { runBackfill } from '../src/sync/backfill.ts'
import {
  address,
  emptyRoot,
  testLogger,
  withTestDatabase,
  zeroLogsBloom,
} from './helpers.ts'

const REQUIRED_INDEXES = [
  'blocks_pkey',
  'logs_block_number_log_index_pk',
  'transactions_pkey',
  'transactions_block_number_index_unique',
] as const

async function indexExists(db: Database, indexName: string): Promise<boolean> {
  const result = await db.execute<{ indexname: string }>(sql`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND indexname = ${indexName}
  `)
  const rows = Array.isArray(result) ? result : (result.rows ?? [])
  return rows.length > 0
}

async function insertSampleRows(db: Database) {
  const hash =
    '0x1111111111111111111111111111111111111111111111111111111111111111'
  const parentHash =
    '0x2222222222222222222222222222222222222222222222222222222222222222'

  await db.insert(schema.blocks).values({
    number: 1n,
    hash,
    isNullRound: false,
    parentHash,
    timestamp: 1n,
    miner: address('a'),
    gasUsed: 1n,
    gasLimit: 30_000_000n,
    baseFeePerGas: 1_000_000_000n,
    size: 1n,
    stateRoot: emptyRoot,
    receiptsRoot: emptyRoot,
    transactionsRoot: emptyRoot,
    extraData: '0x',
    logsBloom: zeroLogsBloom,
  })

  await db.insert(schema.transactions).values({
    hash: '0x3333333333333333333333333333333333333333333333333333333333333333',
    blockNumber: 1n,
    transactionIndex: 0,
    from: address('b'),
    to: address('c'),
    input: '0x',
    value: 0n,
    nonce: 0,
    gas: 21_000n,
    gasPrice: 1n,
    type: 0,
    logsBloom: zeroLogsBloom,
  })

  await db.insert(schema.logs).values({
    blockNumber: 1n,
    logIndex: 0,
    transactionIndex: 0,
    address: address('d'),
    topic0:
      '0x4444444444444444444444444444444444444444444444444444444444444444',
    data: '0x',
  })
}

describe('backfill indexes', () => {
  test('managed indexes exist after migration', async () => {
    await withTestDatabase(async (db) => {
      expect(await managedIndexesExist(db)).toBe(true)
      expect(await getManagedIndexState(db)).toEqual({
        blocks_hash_index: true,
        logs_address_block_number_index: true,
        logs_topic0_block_number_index: true,
      })
    })
  })

  test('drops only managed backfill indexes', async () => {
    await withTestDatabase(async (db) => {
      await dropManagedBackfillIndexes({ db, logger: testLogger })

      expect(await managedIndexesExist(db)).toBe(false)
      for (const indexName of REQUIRED_INDEXES) {
        expect(await indexExists(db, indexName)).toBe(true)
      }
    })
  })

  test('primary key and transaction unique constraints remain enforced', async () => {
    await withTestDatabase(async (db) => {
      await insertSampleRows(db)
      await dropManagedBackfillIndexes({ db, logger: testLogger })

      await expect(async () => {
        await db.insert(schema.blocks).values({
          number: 1n,
          hash: '0x5555555555555555555555555555555555555555555555555555555555555555',
          isNullRound: false,
          parentHash:
            '0x6666666666666666666666666666666666666666666666666666666666666666',
          timestamp: 2n,
          miner: address('a'),
          gasUsed: 1n,
          gasLimit: 30_000_000n,
          baseFeePerGas: 1_000_000_000n,
          size: 1n,
          stateRoot: emptyRoot,
          receiptsRoot: emptyRoot,
          transactionsRoot: emptyRoot,
          extraData: '0x',
          logsBloom: zeroLogsBloom,
        })
      }).toThrow()

      await expect(async () => {
        await db.insert(schema.logs).values({
          blockNumber: 1n,
          logIndex: 0,
          transactionIndex: 0,
          address: address('e'),
          data: '0x01',
        })
      }).toThrow()

      await expect(async () => {
        await db.insert(schema.transactions).values({
          hash: '0x7777777777777777777777777777777777777777777777777777777777777777',
          blockNumber: 1n,
          transactionIndex: 0,
          from: address('b'),
          input: '0x',
          value: 0n,
          nonce: 1,
          gas: 21_000n,
          gasPrice: 1n,
          type: 0,
          logsBloom: zeroLogsBloom,
        })
      }).toThrow()
    })
  })

  test('restores managed indexes idempotently', async () => {
    await withTestDatabase(async (db) => {
      await dropManagedBackfillIndexes({ db, logger: testLogger })
      await restoreManagedBackfillIndexes({ db, logger: testLogger })
      await restoreManagedBackfillIndexes({ db, logger: testLogger })

      expect(await managedIndexesExist(db)).toBe(true)
    })
  })

  test('recovers when only some managed indexes are missing', async () => {
    await withTestDatabase(async (db) => {
      await db.execute(sql.raw('DROP INDEX IF EXISTS "blocks_hash_index"'))

      expect(await anyManagedIndexMissing(db)).toBe(true)
      await restoreManagedBackfillIndexes({ db, logger: testLogger })
      expect(await managedIndexesExist(db)).toBe(true)

      for (const indexName of MANAGED_BACKFILL_INDEXES) {
        expect(await indexExists(db, indexName)).toBe(true)
      }
    })
  })

  test('restores managed indexes after a failed backfill', async () => {
    await withTestDatabase(async (db) => {
      const config = {
        startBlock: 0n,
        finality: 0n,
        backfillConcurrency: 1,
        deferBackfillIndexes: true,
        clients: {
          backfill: {
            getBlockNumber: async () => 0n,
            getBlock: () => Promise.reject(new Error('upstream failure')),
          },
        },
      } as unknown as InternalConfig

      await expect(
        runBackfill({ db, config, logger: testLogger })
      ).rejects.toThrow('upstream failure')
      expect(await managedIndexesExist(db)).toBe(true)
    })
  })
})
