/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import type { Hex } from 'viem'

import { ethGetBlockByHash } from '../src/api/json-rpc/methods/eth-get-block-by-hash.ts'
import { ethGetBlockByNumber } from '../src/api/json-rpc/methods/eth-get-block-by-number.ts'
import type { schema } from '../src/db/schema/index.ts'
import { address, bytes32, emptyRoot } from './helpers.ts'

const storedBloom = `0x${'ab'.repeat(256)}` as Hex
const block: typeof schema.blocks.$inferSelect = {
  number: 1n,
  hash: bytes32('1'),
  isNullRound: false,
  parentHash: bytes32('0'),
  timestamp: 1n,
  miner: address('0'),
  gasUsed: 21_000n,
  gasLimit: 30_000_000n,
  baseFeePerGas: 1_000_000_000n,
  size: 1n,
  stateRoot: emptyRoot,
  receiptsRoot: emptyRoot,
  transactionsRoot: emptyRoot,
  extraData: '0x',
  logsBloom: storedBloom,
}

describe.each(['number', 'hash'] as const)('eth_getBlockBy%s', (lookup) => {
  test('loads only ordered transaction hashes for non-full responses', async () => {
    const hashes = [{ hash: bytes32('2') }, { hash: bytes32('3') }]
    const { result, fullTransactionQueries, transactionHashQueries } =
      await requestBlock(lookup, false, hashes)

    expect(result.logsBloom).toBe(storedBloom)
    expect(result.transactions).toEqual(hashes.map(({ hash }) => hash))
    expect(fullTransactionQueries).toBe(0)
    expect(transactionHashQueries).toBe(1)
  })

  test('loads full transaction rows only for full responses', async () => {
    const { result, fullTransactionQueries, transactionHashQueries } =
      await requestBlock(lookup, true, [])

    expect(result.logsBloom).toBe(storedBloom)
    expect(result.transactions).toEqual([])
    expect(fullTransactionQueries).toBe(1)
    expect(transactionHashQueries).toBe(0)
  })
})

async function requestBlock(
  lookup: 'number' | 'hash',
  full: boolean,
  hashes: { hash: Hex }[]
) {
  let fullTransactionQueries = 0
  let transactionHashQueries = 0
  const args = {
    config: { chainId: 314_159 },
    db: {
      $prepared: {
        getBlockByNumber: { execute: () => [block] },
        getBlockByHash: { execute: () => [block] },
        getTransactionsByBlockNumber: {
          execute: () => {
            fullTransactionQueries++
            return []
          },
        },
        getTransactionHashesByBlockNumber: {
          execute: () => {
            transactionHashQueries++
            return hashes
          },
        },
      },
    },
  }

  const result =
    lookup === 'number'
      ? await ethGetBlockByNumber(args as never, ['0x1', full])
      : await ethGetBlockByHash(args as never, [block.hash, full])

  if (!result) throw new Error('expected block result')
  return { result, fullTransactionQueries, transactionHashQueries }
}
