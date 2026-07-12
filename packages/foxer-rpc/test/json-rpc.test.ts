import { describe, expect, test } from 'bun:test'
import { HttpResponse, http } from 'msw'
import { TimeoutError } from 'viem'

import { handleJsonRpc, isStreamedRequest } from '../src/api/json-rpc/index.ts'
import { createRpcClients } from '../src/rpc/client.ts'
import {
  mockUpstreamRpc,
  realtimeRpcUrl,
  server,
  upstreamRpcUrl,
} from './upstream.ts'

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
    proxy: {
      request: () => {
        throw new Error('unexpected proxy request')
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

  test('proxies allowlisted methods to the isolated upstream client', async () => {
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

  test('forwards upstream json-rpc errors from allowed proxied methods', async () => {
    mockUpstreamRpc(
      {
        eth_call: {
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
        method: 'eth_call',
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

  test('rejects methods outside the proxy allowlist without calling upstream', async () => {
    const requests = mockUpstreamRpc(
      { eth_sendRawTransaction: '0xdeadbeef' },
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
        method: 'eth_sendRawTransaction',
        params: ['0x00'],
      },
    } as never)

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'Method not found' },
    })
    expect(requests).toEqual([])
  })

  test('returns resource unavailable when the upstream proxy times out', async () => {
    const response = await handleJsonRpc({
      ...args,
      config: {
        ...baseConfig,
        clients: {
          ...baseConfig.clients,
          proxy: {
            request: () => {
              throw new TimeoutError({
                body: { method: 'eth_call' },
                url: realtimeRpcUrl,
              })
            },
          },
        },
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: [],
      },
    } as never)

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32002, message: 'Upstream RPC unavailable' },
    })
  })

  test('does not retry unavailable upstream proxy requests', async () => {
    let attempts = 0
    server.use(
      http.post(realtimeRpcUrl, () => {
        attempts += 1
        return HttpResponse.json(
          { error: 'temporarily unavailable' },
          { status: 503 }
        )
      })
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
        method: 'eth_call',
        params: [],
      },
    } as never)

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32002, message: 'Upstream RPC unavailable' },
    })
    expect(attempts).toBe(1)
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
