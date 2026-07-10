/// <reference types="bun" />

import { expect, test } from 'bun:test'
import type { Hex } from 'viem'

import {
  decodeBlock,
  decodeReceipt,
  decodeTransaction,
} from '../src/api/decode.ts'
import { encodeTransaction, encodeTransactionType } from '../src/db/encode.ts'
import { schema } from '../src/db/schema/index.ts'
import type {
  ChainReceipt,
  ChainTransaction,
  EncodedBlock,
} from '../src/types.ts'
import { address, bytes32, emptyRoot, withTestDatabase } from './helpers.ts'

test('encodes oversized fee values and unknown transaction types', async () => {
  await withTestDatabase(async (db) => {
    const largeFee = 2n ** 63n
    const txHash = bytes32('a')
    const block = blockRow(1n)
    const tx = encodeTransaction(
      transaction({
        hash: txHash,
        maxFeePerGas: largeFee,
        type: '0x7e',
      }),
      receipt({ transactionHash: txHash, type: '0x7e' })
    )

    expect(encodeTransactionType('0x7e')).toBe(126)
    expect(tx.type).toBe(126)

    await db.insert(schema.blocks).values(block)
    await db.insert(schema.transactions).values(tx)

    const [storedBlock] = await db.select().from(schema.blocks)
    const [storedTx] = await db.select().from(schema.transactions)

    expect(storedTx.maxFeePerGas).toBe(largeFee)

    const decodedTx = decodeTransaction(storedTx, 314_159, storedBlock)
    expect(decodedTx.type).toBe('0x7e')
    expect(decodedTx.chainId).toBe('0x4cb2f')

    const decodedBlock = decodeBlock(storedBlock, [storedTx], [], true, 314_159)
    expect(decodedBlock.logsBloom).toMatch(/^0x[0-9a-f]{512}$/)
    expect(decodedBlock.transactions[0]).toMatchObject({
      hash: txHash,
      type: '0x7e',
      chainId: '0x4cb2f',
    })

    const decodedReceipt = decodeReceipt(storedTx, storedBlock, [])
    expect(decodedReceipt.logsBloom).toMatch(/^0x[0-9a-f]{512}$/)
    expect(decodedReceipt.type).toBe('0x7e')
  })
})

function transaction(
  overrides: Omit<Partial<ChainTransaction>, 'type'> & {
    type: ChainTransaction['type'] | Hex
  }
): ChainTransaction {
  return {
    hash: bytes32('a'),
    blockNumber: 1n,
    transactionIndex: 0,
    from: address('a'),
    to: address('b'),
    input: '0x',
    value: 0n,
    nonce: 0,
    gas: 21_000n,
    gasPrice: 1n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    v: 1n,
    r: bytes32('c'),
    s: bytes32('d'),
    accessList: [],
    ...overrides,
  } as unknown as ChainTransaction
}

function receipt(overrides: Partial<ChainReceipt>): ChainReceipt {
  return {
    transactionHash: bytes32('a'),
    transactionIndex: 0,
    blockHash: bytes32('1'),
    blockNumber: 1n,
    from: address('a'),
    to: address('b'),
    cumulativeGasUsed: 21_000n,
    gasUsed: 21_000n,
    contractAddress: null,
    logs: [],
    status: 'success',
    effectiveGasPrice: 1n,
    type: 'eip1559',
    ...overrides,
  }
}

function blockRow(number: bigint): EncodedBlock {
  return {
    number,
    hash: bytes32('1'),
    isNullRound: false,
    parentHash: bytes32('0'),
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
