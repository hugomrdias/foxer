/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import type { Hash } from 'viem'

import { handleJsonRpc } from '../src/api/json-rpc.ts'
import type { Database } from '../src/db/client.ts'
import { schema } from '../src/db/schema/index.ts'
import type { EncodedBlock, EncodedTransaction } from '../src/types.ts'
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
const address1 = address('1')
const address2 = address('2')
const topic1 = bytes32('3')
const topic2 = bytes32('4')
const topic3 = bytes32('5')

describe('eth_getLogs', () => {
  test('applies address, topic, blockHash, and cap filters', async () => {
    await withTestDatabase(async (db) => {
      await seedLogs(db)

      const byAddress = await getLogs(db, {
        fromBlock: '0x1',
        toBlock: '0x2',
        address: address1,
      })
      expect(byAddress.result.map((log) => log.logIndex)).toEqual([
        '0x0',
        '0x0',
      ])

      const byAddressOr = await getLogs(db, {
        fromBlock: '0x1',
        toBlock: '0x2',
        address: [address2],
      })
      expect(byAddressOr.result.map((log) => log.address)).toEqual([address2])

      const emptyAddressOr = await getLogs(db, {
        fromBlock: '0x1',
        toBlock: '0x2',
        address: [],
      })
      expect(emptyAddressOr.result).toEqual([])

      const byTopicWildcard = await getLogs(db, {
        fromBlock: '0x1',
        toBlock: '0x2',
        topics: [null, topic2],
      })
      expect(byTopicWildcard.result.map((log) => log.logIndex)).toEqual(['0x1'])

      const byTopicOr = await getLogs(db, {
        fromBlock: '0x1',
        toBlock: '0x2',
        topics: [[topic1, topic3]],
      })
      expect(byTopicOr.result).toHaveLength(3)

      const byBlockHash = await getLogs(db, { blockHash: block1 })
      expect(byBlockHash.result.map((log) => log.blockHash)).toEqual([
        block1,
        block1,
      ])

      const blockHashConflict = await rpc(db, {
        blockHash: block1,
        fromBlock: '0x1',
      })
      expect(blockHashConflict.error?.code).toBe(-32602)

      const rangeTooLarge = await rpc(
        db,
        { fromBlock: '0x1', toBlock: '0x2' },
        { maxLogsBlockRange: 0n }
      )
      expect(rangeTooLarge.error?.code).toBe(-32005)

      const resultTooLarge = await rpc(
        db,
        { fromBlock: '0x1', toBlock: '0x2' },
        { maxLogsResultRows: 1 }
      )
      expect(resultTooLarge.error?.code).toBe(-32005)
    })
  })
})

async function getLogs(db: Database, filter: Record<string, unknown>) {
  const response = await rpc(db, filter)
  if (response.error) throw new Error(response.error.message)
  return response as Extract<typeof response, { result: unknown }>
}

async function rpc(
  db: Database,
  filter: Record<string, unknown>,
  overrides: { maxLogsBlockRange?: bigint; maxLogsResultRows?: number } = {}
) {
  return (await handleJsonRpc({
    db,
    logger: testLogger,
    config: {
      chainId: 314_159,
      maxLogsBlockRange: overrides.maxLogsBlockRange ?? 10n,
      maxLogsResultRows: overrides.maxLogsResultRows ?? 10,
    },
    body: {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_getLogs',
      params: [filter],
    },
  } as never)) as {
    result: Array<{ address: string; blockHash: string; logIndex: string }>
    error?: { code: number; message: string }
  }
}

async function seedLogs(db: Database) {
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
      address: address1,
      topic0: topic1,
      topic1: null,
      topic2: null,
      topic3: null,
      data: '0x',
    },
    {
      blockNumber: 1n,
      logIndex: 1,
      transactionIndex: 0,
      address: address2,
      topic0: topic1,
      topic1: topic2,
      topic2: null,
      topic3: null,
      data: '0x',
    },
    {
      blockNumber: 2n,
      logIndex: 0,
      transactionIndex: 0,
      address: address1,
      topic0: topic3,
      topic1: null,
      topic2: null,
      topic3: null,
      data: '0x',
    },
  ])
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
