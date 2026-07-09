/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'

import { handleJsonRpc } from '../src/api/json-rpc.ts'
import type { Database } from '../src/db/client.ts'
import { schema } from '../src/db/schema/index.ts'
import {
  address,
  bytes32,
  emptyRoot,
  testLogger,
  withTestDatabase,
} from './helpers.ts'

const block1 = bytes32('1')
const block2 = bytes32('2')
const tx1 = bytes32('a')
const tx2 = bytes32('b')

describe('eth_getBlockReceipts', () => {
  test('resolves block numbers, tags, and hashes', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)

      const byNumber = await rpc(db, '0x1')
      expect(byNumber.result.map((receipt) => receipt.transactionHash)).toEqual(
        [tx1]
      )

      const byLatest = await rpc(db, 'latest')
      expect(byLatest.result.map((receipt) => receipt.transactionHash)).toEqual(
        [tx2]
      )

      const byHash = await rpc(db, block1)
      expect(byHash.result).toHaveLength(1)
      expect(byHash.result[0]).toMatchObject({
        blockHash: block1,
        blockNumber: '0x1',
        transactionHash: tx1,
        transactionIndex: '0x0',
      })
      expect(byHash.result[0]?.logs).toEqual([
        expect.objectContaining({
          blockHash: block1,
          transactionHash: tx1,
          logIndex: '0x0',
        }),
      ])
    })
  })

  test('returns null for an unknown valid block hash', async () => {
    await withTestDatabase(async (db) => {
      await seedReceipts(db)

      const response = await rpc(db, bytes32('f'))
      expect(response.result).toBeNull()
    })
  })

  test('returns invalid params for malformed block identifiers', async () => {
    await withTestDatabase(async (db) => {
      const response = await rpc(db, '0xzz')
      expect(response.error).toEqual({
        code: -32602,
        message: 'invalid block parameter',
      })
    })
  })
})

async function rpc(db: Database, block: unknown) {
  return (await handleJsonRpc({
    db,
    logger: testLogger,
    config: {
      chainId: 314_159,
      clients: {
        backfill: {
          request: () => {
            throw new Error('unexpected proxy request')
          },
        },
      },
    },
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getBlockReceipts',
      params: [block],
    },
  } as never)) as {
    result: Array<{
      blockHash: string
      blockNumber: string
      transactionHash: string
      transactionIndex: string
      logs: Array<{
        blockHash: string
        transactionHash: string
        logIndex: string
      }>
    }> | null
    error?: { code: number; message: string }
  }
}

async function seedReceipts(db: Database) {
  await db
    .insert(schema.blocks)
    .values([blockRow(1n, block1, bytes32('0')), blockRow(2n, block2, block1)])
  await db
    .insert(schema.transactions)
    .values([txRow(1n, 0, tx1), txRow(2n, 0, tx2)])
  await db.insert(schema.logs).values([
    {
      blockNumber: 1n,
      logIndex: 0,
      transactionIndex: 0,
      address: address('1'),
      topic0: bytes32('3'),
      topic1: null,
      topic2: null,
      topic3: null,
      data: '0x',
    },
  ])
}

function blockRow(number: bigint, hash: string, parentHash: string) {
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
  }
}

function txRow(blockNumber: bigint, transactionIndex: number, hash: string) {
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
