import { describe, expect, test } from 'bun:test'
import { HttpResponse, http } from 'msw'
import { TimeoutError } from 'viem'

import {
  InvalidParamsError,
  MethodNotFoundError,
} from '../src/api/json-rpc/errors.ts'
import {
  handleJsonRpc as dispatchJsonRpc,
  isStreamedRequest,
} from '../src/api/json-rpc/index.ts'
import { createRpcClients } from '../src/rpc/client.ts'
import { handleTestJsonRpcFailure } from './helpers.ts'
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

async function handleJsonRpc(args: Parameters<typeof dispatchJsonRpc>[0]) {
  try {
    return await dispatchJsonRpc(args)
  } catch (cause) {
    return handleTestJsonRpcFailure(cause, {
      id: args.body.id ?? null,
      request: args.body,
    })
  }
}

describe('handleJsonRpc', () => {
  test('throws typed failures for the transport boundary to handle', async () => {
    await expect(
      dispatchJsonRpc({
        ...args,
        body: {
          jsonrpc: '2.0',
          id: 1,
          method: 'unknown_method',
          params: [],
        },
      } as never)
    ).rejects.toBeInstanceOf(MethodNotFoundError)

    await expect(
      dispatchJsonRpc({
        ...args,
        body: {
          jsonrpc: '2.0',
          id: 2,
          method: 'eth_getBlockByNumber',
          params: ['0x'],
        },
      } as never)
    ).rejects.toBeInstanceOf(InvalidParamsError)
  })

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

  test('proxies block trace methods with opaque provider options', async () => {
    const requests = mockUpstreamRpc(
      {
        debug_traceBlockByNumber: [],
        debug_traceBlockByHash: [],
      },
      { url: realtimeRpcUrl }
    )
    const clients = createRpcClients({
      rpcUrl: upstreamRpcUrl,
      realtimeRpcUrl,
    })
    const blockHash = `0x${'ab'.repeat(32)}`
    const cases = [
      {
        method: 'debug_traceBlockByNumber',
        params: ['latest'],
      },
      {
        method: 'debug_traceBlockByNumber',
        params: [
          '0x10',
          {
            tracer: 'vendorTracer',
            tracerConfig: { vendorOption: true },
          },
        ],
      },
      {
        method: 'debug_traceBlockByHash',
        params: [blockHash, { tracer: 'callTracer', onlyTopCall: true }],
      },
    ] as const

    for (const [index, item] of cases.entries()) {
      const response = await handleJsonRpc({
        ...args,
        config: { ...baseConfig, clients },
        body: {
          jsonrpc: '2.0',
          id: index,
          method: item.method,
          params: [...item.params],
        },
      } as never)

      expect(response).toEqual({ jsonrpc: '2.0', id: index, result: [] })
      expect(requests[index]).toMatchObject(item)
    }
  })

  test('rejects malformed block trace requests without calling upstream', async () => {
    const requests = mockUpstreamRpc(
      {
        debug_traceBlockByNumber: [],
        debug_traceBlockByHash: [],
      },
      { url: realtimeRpcUrl }
    )
    const clients = createRpcClients({
      rpcUrl: upstreamRpcUrl,
      realtimeRpcUrl,
    })
    const cases = [
      { method: 'debug_traceBlockByNumber', params: [] },
      { method: 'debug_traceBlockByNumber', params: ['0x'] },
      { method: 'debug_traceBlockByNumber', params: ['0x1', null] },
      { method: 'debug_traceBlockByHash', params: ['0x1234'] },
      {
        method: 'debug_traceBlockByHash',
        params: [`0x${'ab'.repeat(32)}`, []],
      },
      {
        method: 'debug_traceBlockByHash',
        params: [`0x${'ab'.repeat(32)}`, {}, 'extra'],
      },
    ]

    for (const [index, item] of cases.entries()) {
      const response = await handleJsonRpc({
        ...args,
        config: { ...baseConfig, clients },
        body: {
          jsonrpc: '2.0',
          id: index,
          method: item.method,
          params: item.params,
        },
      } as never)

      expect(response).toMatchObject({
        jsonrpc: '2.0',
        id: index,
        error: { code: -32602 },
      })
    }
    expect(requests).toEqual([])
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

  test('keeps other debug methods outside the proxy allowlist', async () => {
    const requests = mockUpstreamRpc(
      {
        debug_traceCall: [],
        debug_traceTransaction: [],
      },
      { url: realtimeRpcUrl }
    )
    const clients = createRpcClients({
      rpcUrl: upstreamRpcUrl,
      realtimeRpcUrl,
    })

    for (const method of ['debug_traceCall', 'debug_traceTransaction']) {
      const response = await handleJsonRpc({
        ...args,
        config: { ...baseConfig, clients },
        body: { jsonrpc: '2.0', id: 1, method, params: [] },
      } as never)

      expect(response).toEqual({
        jsonrpc: '2.0',
        id: 1,
        error: { code: -32601, message: 'Method not found' },
      })
    }
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
