import { describe, expect, test } from 'bun:test'

import { handleJsonRpc, isStreamedRequest } from '../src/api/json-rpc/index.ts'
import { createRpcClients } from '../src/rpc/client.ts'
import { mockUpstreamRpc, realtimeRpcUrl, upstreamRpcUrl } from './upstream.ts'

const baseConfig = {
  chainId: 314_159,
  clients: {
    backfill: {
      request: () => {
        throw new Error('unexpected backfill proxy request')
      },
    },
    live: {
      request: () => {
        throw new Error('unexpected live proxy request')
      },
    },
  },
}

const args = {
  config: baseConfig,
  db: {},
  logger: {
    error: () => undefined,
  },
}

describe('handleJsonRpc', () => {
  test('identifies methods that use the streaming transport', () => {
    expect(
      isStreamedRequest({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBlockReceipts',
        params: ['latest'],
      })
    ).toBe(true)
    expect(
      isStreamedRequest({
        jsonrpc: '2.0',
        id: 2,
        method: 'eth_getTransactionReceipt',
        params: ['0x0'],
      })
    ).toBe(true)
    expect(
      isStreamedRequest({
        jsonrpc: '2.0',
        id: 3,
        method: 'eth_chainId',
        params: [],
      })
    ).toBe(false)
  })

  test('proxies unsupported methods to the upstream rpc', async () => {
    const requests = mockUpstreamRpc(
      { eth_call: '0x1234' },
      { url: realtimeRpcUrl }
    )
    const response = await handleJsonRpc({
      ...args,
      config: {
        ...baseConfig,
        clients: createRpcClients({
          rpcUrl: upstreamRpcUrl,
          realtimeRpcUrl,
        }),
      },
      body: {
        jsonrpc: '2.0',
        id: 'call-1',
        method: 'eth_call',
        params: [
          { to: '0x0000000000000000000000000000000000000000' },
          'latest',
        ],
      },
    } as never)

    expect(requests[0]).toMatchObject({
      method: 'eth_call',
      params: [{ to: '0x0000000000000000000000000000000000000000' }, 'latest'],
    })
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'call-1',
      result: '0x1234',
    })
  })

  test('forwards upstream json-rpc errors from proxied methods', async () => {
    mockUpstreamRpc(
      {
        debug_traceBlockByHash: {
          error: { code: -32601, message: 'Method not found' },
        },
      },
      { url: realtimeRpcUrl }
    )
    const response = await handleJsonRpc({
      ...args,
      config: {
        ...baseConfig,
        clients: createRpcClients({
          rpcUrl: upstreamRpcUrl,
          realtimeRpcUrl,
        }),
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'debug_traceBlockByHash',
        params: [],
      },
    } as never)

    expect(response).toMatchObject({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601 },
    })
    expect('error' in response && response.error?.message).toContain(
      'Method not found'
    )
  })

  test('returns invalid params for malformed block quantities', async () => {
    const response = await handleJsonRpc({
      ...args,
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_getBlockByNumber',
        params: ['0x'],
      },
    } as never)

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'invalid block parameter' },
    })
  })
})
