/// <reference types="bun" />

import { describe, expect, mock, test } from 'bun:test'

mock.module('@hono/node-server', () => ({
  serve: (_options: unknown, onListen: () => void) => {
    onListen()
    return {}
  },
}))

mock.module('http-shutdown', () => ({
  default: () => ({
    shutdown: (callback: (error?: Error) => void) => {
      queueMicrotask(() => callback())
    },
  }),
}))

const { createApi } = await import('../src/api/create-api.ts')

const mockDb = {
  $prepared: {
    getLatestBlock: {
      execute: async () => [],
    },
  },
} as never

const mockLogger = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
} as never

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
} as never

describe('createApi', () => {
  test('stop awaits graceful http-shutdown completion', async () => {
    const api = createApi({
      db: mockDb,
      config: baseConfig,
      logger: mockLogger,
      port: 8545,
    })

    await expect(api.stop()).resolves.toBeUndefined()
  })
})
