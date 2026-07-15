import { describe, expect, test } from 'bun:test'
import { http, passthrough } from 'msw'

import { createApi } from '../src/api/create-api.ts'
import { server } from './upstream.ts'

const mockDb = {
  $prepared: {
    getLatestBlock: {
      execute: async () => [],
    },
  },
} as never

const baseConfig = {
  chainId: 314_159,
  maxConnections: 100,
  maxStreamConnections: 80,
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
    let listeningPort: number | undefined
    let markListening: () => void = () => undefined
    const listening = new Promise<void>((resolve) => {
      markListening = resolve
    })
    const api = createApi({
      db: mockDb,
      config: baseConfig,
      logger: {
        error: () => undefined,
        info: (context: unknown, message?: string) => {
          if (message === 'json-rpc server listening') {
            listeningPort = (context as { port: number }).port
            markListening()
          }
        },
        warn: () => undefined,
      } as never,
      port: 0,
    })

    await listening
    const healthUrl = `http://127.0.0.1:${listeningPort}/health`
    server.use(http.get(healthUrl, () => passthrough()))
    const response = await fetch(healthUrl)
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      ok: true,
      chainId: 314_159,
      latestIndexedBlock: null,
    })
    await expect(api.stop()).resolves.toBeUndefined()
  })
})
