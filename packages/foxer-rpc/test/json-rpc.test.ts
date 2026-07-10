/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'

import { handleJsonRpc } from '../src/api/json-rpc.ts'

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
  test('returns invalid request for a single notification', async () => {
    await expect(
      handleJsonRpc({
        ...args,
        body: { jsonrpc: '2.0', method: 'web3_clientVersion' },
      } as never)
    ).resolves.toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Invalid Request' },
    })
  })

  test('returns explicit errors for notification batch items', async () => {
    await expect(
      handleJsonRpc({
        ...args,
        body: [
          { jsonrpc: '2.0', method: 'web3_clientVersion' },
          { jsonrpc: '2.0', method: 'eth_chainId' },
        ],
      } as never)
    ).resolves.toEqual([
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request' },
      },
      {
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request' },
      },
    ])
  })

  test('proxies unsupported methods to the upstream rpc', async () => {
    const requests: unknown[] = []
    const response = await handleJsonRpc({
      ...args,
      config: {
        ...baseConfig,
        clients: {
          backfill: {
            request: () => {
              throw new Error('unexpected backfill proxy request')
            },
          },
          live: {
            request: (request: unknown) => {
              requests.push(request)
              return '0x1234'
            },
          },
        },
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

    expect(requests).toEqual([
      {
        method: 'eth_call',
        params: [
          { to: '0x0000000000000000000000000000000000000000' },
          'latest',
        ],
      },
    ])
    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 'call-1',
      result: '0x1234',
    })
  })

  test('preserves batch responses for local and proxied methods', async () => {
    const response = await handleJsonRpc({
      ...args,
      config: {
        ...baseConfig,
        clients: {
          backfill: {
            request: () => {
              throw new Error('unexpected backfill proxy request')
            },
          },
          live: {
            request: () => '0xabcd',
          },
        },
      },
      body: [
        { jsonrpc: '2.0', id: 1, method: 'web3_clientVersion' },
        { jsonrpc: '2.0', id: 2, method: 'eth_getCode', params: [] },
      ],
    } as never)

    expect(response).toEqual([
      { jsonrpc: '2.0', id: 1, result: 'foxer-rpc/0.0.0' },
      { jsonrpc: '2.0', id: 2, result: '0xabcd' },
    ])
  })

  test('forwards upstream json-rpc errors from proxied methods', async () => {
    const response = await handleJsonRpc({
      ...args,
      config: {
        ...baseConfig,
        clients: {
          backfill: {
            request: () => {
              throw new Error('unexpected backfill proxy request')
            },
          },
          live: {
            request: () => {
              throw { code: -32601, message: 'Method not found' }
            },
          },
        },
      },
      body: {
        jsonrpc: '2.0',
        id: 1,
        method: 'debug_traceBlockByHash',
        params: [],
      },
    } as never)

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32601, message: 'Method not found' },
    })
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
