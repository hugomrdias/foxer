/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'

import { createApi } from '../src/api/create-api.ts'

const mockDb = {
  $prepared: {
    getLatestBlock: {
      execute: async () => [],
    },
  },
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
  test('starts and gracefully stops a real HTTP server', async () => {
    let markListening: () => void = () => undefined
    const listening = new Promise<void>((resolve) => {
      markListening = resolve
    })
    const api = createApi({
      db: mockDb,
      config: baseConfig,
      logger: {
        error: () => undefined,
        info: (_context: unknown, message?: string) => {
          if (message === 'json-rpc server listening') markListening()
        },
        warn: () => undefined,
      } as never,
      port: 0,
    })

    await listening
    await expect(api.stop()).resolves.toBeUndefined()
  })
})
