/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'

import { handleJsonRpc } from '../src/api/json-rpc.ts'

const args = {
  config: {
    chainId: 314_159,
  },
  db: {},
} as Parameters<typeof handleJsonRpc>[0]

describe('handleJsonRpc', () => {
  test('does not return a response for a single notification', async () => {
    await expect(
      handleJsonRpc({
        ...args,
        body: { jsonrpc: '2.0', method: 'web3_clientVersion' },
      })
    ).resolves.toBeUndefined()
  })

  test('does not return a response when every batch item is a notification', async () => {
    await expect(
      handleJsonRpc({
        ...args,
        body: [
          { jsonrpc: '2.0', method: 'web3_clientVersion' },
          { jsonrpc: '2.0', method: 'eth_chainId' },
        ],
      })
    ).resolves.toBeUndefined()
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
    })

    expect(response).toEqual({
      jsonrpc: '2.0',
      id: 1,
      error: { code: -32602, message: 'invalid block parameter' },
    })
  })
})
