import { expect, test } from 'bun:test'

import { createRpcClients } from '../src/rpc/client.ts'
import { getBlockReceipts } from '../src/rpc/get-receipts.ts'
import { rpcReceipt } from './rpc-fixtures.ts'
import { mockUpstreamRpc, upstreamRpcUrl } from './upstream.ts'

test('getBlockReceipts uses HTTP and normalizes viem receipt fields', async () => {
  const requests = mockUpstreamRpc({ eth_getBlockReceipts: [rpcReceipt()] })
  const client = createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill

  const [receipt] = await getBlockReceipts({ client, blockNumber: 123n })

  expect(requests.map(({ method }) => method)).toEqual(['eth_getBlockReceipts'])
  expect(receipt.transactionHash).toBe(
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
  )
  expect(receipt.transactionIndex).toBe(1)
  expect(receipt.status).toBe('success')
  expect(receipt.effectiveGasPrice).toBe(100n)
  expect(receipt.logs[0]?.data).toBe('0xabcd')
  expect(receipt.logsBloom).toBe(`0x${'00'.repeat(255)}ab`)
})

test('getBlockReceipts rejects malformed receipt logs blooms from HTTP', async () => {
  mockUpstreamRpc({ eth_getBlockReceipts: [rpcReceipt('0xzz')] })
  const client = createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill

  await expect(getBlockReceipts({ client, blockNumber: 123n })).rejects.toThrow(
    'invalid hex value'
  )
})

test('getBlockReceipts rejects receipt logs blooms wider than 256 bytes', async () => {
  mockUpstreamRpc({
    eth_getBlockReceipts: [rpcReceipt(`0x${'ff'.repeat(257)}`)],
  })
  const client = createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill

  await expect(getBlockReceipts({ client, blockNumber: 123n })).rejects.toThrow(
    'hex value exceeds 256 bytes'
  )
})
