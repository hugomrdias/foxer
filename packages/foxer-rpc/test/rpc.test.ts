/// <reference types="bun" />

import { expect, test } from 'bun:test'

import { getBlockReceipts } from '../src/rpc/get-receipts.ts'

test('getBlockReceipts adapts viem formatted receipts', async () => {
  const client = {
    getBlockReceipts: async () => [
      {
        transactionHash:
          '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        transactionIndex: 1,
        blockHash:
          '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
        blockNumber: 123n,
        from: '0xCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
        to: null,
        cumulativeGasUsed: 21_000n,
        gasUsed: 21_000n,
        contractAddress: null,
        logs: [
          {
            address: '0xDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDDD',
            topics: [
              '0xEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEEE',
            ],
            data: '0xABCD',
            blockNumber: 123n,
            transactionHash:
              '0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            transactionIndex: 1,
            blockHash:
              '0xBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            logIndex: 0,
            removed: false,
          },
        ],
        status: 'success',
        effectiveGasPrice: 100n,
        type: 'eip1559',
      },
    ],
  }

  const [receipt] = await getBlockReceipts({
    client: client as never,
    blockNumber: 123n,
  })

  expect(receipt.transactionHash).toBe(
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )
  expect(receipt.transactionIndex).toBe(1)
  expect(receipt.status).toBe('success')
  expect(receipt.effectiveGasPrice).toBe(100n)
  expect(receipt.logs[0]?.data).toBe('0xabcd')
})
