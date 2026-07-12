import type { Hash } from 'viem'

import { createApiServer } from '../../src/api/server.ts'
import type { Database } from '../../src/db/client.ts'
import { schema } from '../../src/db/schema/index.ts'
import type { EncodedBlock, EncodedTransaction } from '../../src/types.ts'
import {
  address,
  bytes32,
  emptyRoot,
  testLogger,
  zeroLogsBloom,
} from '../helpers.ts'

export const block1 = bytes32('1')
export const block2 = bytes32('2')
export const tx1 = bytes32('a')
export const tx2 = bytes32('b')
export const tx3 = bytes32('e')

export function createReceiptTestApi(db: Database) {
  return createApiServer({
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
        live: {
          request: () => {
            throw new Error('unexpected proxy request')
          },
        },
      },
    } as never,
  })
}

export async function seedReceipts(db: Database) {
  await db
    .insert(schema.blocks)
    .values([blockRow(1n, block1, bytes32('0')), blockRow(2n, block2, block1)])
  await db
    .insert(schema.transactions)
    .values([transactionRow(1n, 0, tx1), transactionRow(2n, 0, tx2)])
  await db.insert(schema.logs).values([logRow(1n, 0, 0, '1')])
}

export function logRow(
  blockNumber: bigint,
  logIndex: number,
  transactionIndex: number,
  marker: string
) {
  return {
    blockNumber,
    logIndex,
    transactionIndex,
    address: address(marker),
    topic0: bytes32(marker),
    topic1: null,
    topic2: null,
    topic3: null,
    data: '0x' as const,
  }
}

export function blockRow(
  number: bigint,
  hash: Hash,
  parentHash: Hash
): EncodedBlock {
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

export function transactionRow(
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
    logsBloom: zeroLogsBloom,
  }
}
