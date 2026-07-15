import { expect, test } from 'bun:test'

import { createRpcClients } from '../src/rpc/client.ts'
import { getEncodedBlockReceipts } from '../src/rpc/get-receipts.ts'
import type { ChainBlock } from '../src/types.ts'
import { copyTransaction } from './copy-fixtures.ts'
import { address, bytes32, emptyRoot, zeroLogsBloom } from './helpers.ts'
import { rpcReceipt } from './rpc-fixtures.ts'
import { mockUpstreamRpc, upstreamRpcUrl } from './upstream.ts'

test('receipt ingestion fetches HTTP data and returns canonical rows', async () => {
  const requests = mockUpstreamRpc({ eth_getBlockReceipts: [rpcReceipt()] })
  const client = createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill

  const encoded = await getEncodedBlockReceipts({
    client,
    block: blockWithTransaction(),
  })
  const [transaction] = encoded.transactions

  expect(requests.map(({ method }) => method)).toEqual(['eth_getBlockReceipts'])
  expect(transaction.hash).toBe(bytes32('a'))
  expect(transaction.status).toBe(1)
  expect(transaction.effectiveGasPrice).toBe(100n)
  expect(transaction.logsBloom).toBe(`0x${'00'.repeat(255)}ab`)
  expect(encoded.logs[0]?.data).toBe('0xabcd')
})

test('receipt ingestion rejects malformed receipt logs blooms from HTTP', async () => {
  mockUpstreamRpc({ eth_getBlockReceipts: [rpcReceipt('0xzz')] })
  const client = createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill

  await expect(
    getEncodedBlockReceipts({ client, block: blockWithTransaction() })
  ).rejects.toThrow('invalid hex value')
})

test('receipt ingestion rejects receipt logs blooms wider than 256 bytes', async () => {
  mockUpstreamRpc({
    eth_getBlockReceipts: [rpcReceipt(`0x${'ff'.repeat(257)}`)],
  })
  const client = createRpcClients({ rpcUrl: upstreamRpcUrl }).backfill

  await expect(
    getEncodedBlockReceipts({ client, block: blockWithTransaction() })
  ).rejects.toThrow('hex value exceeds 256 bytes')
})

function blockWithTransaction(): ChainBlock {
  return {
    number: 123n,
    hash: bytes32('1'),
    parentHash: bytes32('0'),
    timestamp: 123n,
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
    transactions: [
      copyTransaction({
        blockNumber: 123n,
        hash: bytes32('a'),
      }),
    ],
  } as unknown as ChainBlock
}
