/// <reference types="bun" />

import { expect, test } from 'bun:test'

import { getBlockReceipts } from '../src/rpc/get-receipts.ts'

test('getBlockReceipts normalizes viem receipt fields and logs bloom', async () => {
  const [receipt] = await getBlockReceipts({
    client: receiptClient('0xAB') as never,
    blockNumber: 123n,
  })

  expect(receipt.transactionHash).toBe(
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )
  expect(receipt.transactionIndex).toBe(1)
  expect(receipt.status).toBe('success')
  expect(receipt.effectiveGasPrice).toBe(100n)
  expect(receipt.logs[0]?.data).toBe('0xabcd')
  expect(receipt.logsBloom).toBe(`0x${'00'.repeat(255)}ab`)
})

test('getBlockReceipts rejects malformed receipt logs blooms', async () => {
  await expect(
    getBlockReceipts({
      client: receiptClient('0xzz') as never,
      blockNumber: 123n,
    })
  ).rejects.toThrow('logs bloom: invalid hex value')
})

test('getBlockReceipts rejects receipt logs blooms wider than 256 bytes', async () => {
  await expect(
    getBlockReceipts({
      client: receiptClient(`0x${'ff'.repeat(257)}`) as never,
      blockNumber: 123n,
    })
  ).rejects.toThrow('logs bloom: hex value exceeds 256 bytes')
})

function receiptClient(logsBloom: string) {
  return {
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
        logsBloom,
      },
    ],
  }
}
