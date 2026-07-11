/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import type { Hash } from 'viem'

import type { Database } from '../src/db/client.ts'
import { schema } from '../src/db/schema/index.ts'
import {
  ensureParentContinuity,
  verifyRecentBlocks,
} from '../src/sync/reorg.ts'
import type {
  EncodedBlock,
  EncodedLog,
  EncodedTransaction,
} from '../src/types.ts'
import {
  address,
  bytes32,
  emptyRoot,
  testLogger,
  withTestDatabase,
  zeroLogsBloom,
} from './helpers.ts'

describe('reorg handling', () => {
  test('ensureParentContinuity returns null when parent matches', async () => {
    await withTestDatabase(async (db) => {
      await seedChain(db)

      const rewindTo = await ensureParentContinuity({
        logger: testLogger,
        db,
        client: clientWithBlocks({}),
        block: blockRow(4n, bytes32('4'), bytes32('3')),
      })

      expect(rewindTo).toBeNull()
    })
  })

  test('ensureParentContinuity deletes from the divergent block', async () => {
    await withTestDatabase(async (db) => {
      await seedChain(db)

      const rewindTo = await ensureParentContinuity({
        logger: testLogger,
        db,
        client: clientWithBlocks({
          3: { hash: bytes32('9'), parentHash: bytes32('8') },
          2: { hash: bytes32('8'), parentHash: bytes32('1') },
          1: { hash: bytes32('1'), parentHash: bytes32('0') },
        }),
        block: blockRow(4n, bytes32('4'), bytes32('9')),
      })

      expect(rewindTo).toBe(2n)
      await expectCounts(db, { blocks: 1, transactions: 1, logs: 1 })
      expect(
        await db
          .select()
          .from(schema.blocks)
          .where(eq(schema.blocks.number, 1n))
      ).toHaveLength(1)
    })
  })

  test('verifyRecentBlocks deletes from the first mismatching block', async () => {
    await withTestDatabase(async (db) => {
      await seedChain(db)

      await verifyRecentBlocks({
        logger: testLogger,
        db,
        depth: 3n,
        client: clientWithBlocks({
          1: { hash: bytes32('1'), parentHash: bytes32('0') },
          2: { hash: bytes32('8'), parentHash: bytes32('1') },
          3: { hash: bytes32('9'), parentHash: bytes32('8') },
        }),
      })

      await expectCounts(db, { blocks: 1, transactions: 1, logs: 1 })
    })
  })
})

function clientWithBlocks(
  blocks: Record<number, { hash: string; parentHash: string }>
) {
  return {
    getBlock: ({ blockNumber }: { blockNumber: bigint }) => {
      const block = blocks[Number(blockNumber)]
      if (!block) throw new Error(`missing block ${blockNumber}`)
      return {
        number: blockNumber,
        hash: block.hash,
        parentHash: block.parentHash,
      }
    },
  } as never
}

async function expectCounts(
  db: Database,
  expected: { blocks: number; transactions: number; logs: number }
) {
  expect(await db.select().from(schema.blocks)).toHaveLength(expected.blocks)
  expect(await db.select().from(schema.transactions)).toHaveLength(
    expected.transactions
  )
  expect(await db.select().from(schema.logs)).toHaveLength(expected.logs)
}

async function seedChain(db: Database) {
  await db
    .insert(schema.blocks)
    .values([
      blockRow(1n, bytes32('1'), bytes32('0')),
      blockRow(2n, bytes32('2'), bytes32('1')),
      blockRow(3n, bytes32('3'), bytes32('2')),
    ])
  await db
    .insert(schema.transactions)
    .values([
      txRow(1n, 0, bytes32('a')),
      txRow(2n, 0, bytes32('b')),
      txRow(3n, 0, bytes32('c')),
    ])
  await db
    .insert(schema.logs)
    .values([logRow(1n, 0), logRow(2n, 1), logRow(3n, 2)])
}

function blockRow(number: bigint, hash: Hash, parentHash: Hash): EncodedBlock {
  return {
    number,
    hash,
    isNullRound: false,
    parentHash,
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
  }
}

function txRow(
  blockNumber: bigint,
  transactionIndex: number,
  hash: Hash
): EncodedTransaction {
  return {
    hash,
    blockNumber,
    transactionIndex,
    from: address('a'),
    to: address('b'),
    input: '0x',
    value: 0n,
    nonce: transactionIndex,
    gas: 21_000n,
    gasPrice: 1n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    type: 2,
    v: 1n,
    r: bytes32('c'),
    s: bytes32('d'),
    accessList: null,
    status: 1,
    receiptGasUsed: 21_000n,
    cumulativeGasUsed: 21_000n,
    effectiveGasPrice: 1n,
    contractAddress: null,
  }
}

function logRow(blockNumber: bigint, logIndex: number): EncodedLog {
  return {
    blockNumber,
    logIndex,
    transactionIndex: 0,
    address: address('1'),
    topic0: bytes32('1'),
    topic1: null,
    topic2: null,
    topic3: null,
    data: '0x',
  }
}
