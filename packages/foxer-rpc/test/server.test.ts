import { describe, expect, test } from 'bun:test'
import { sign } from 'hono/jwt'
import pino from 'pino'
import { StreamCapacityLimiter } from '../src/api/json-rpc/stream-capacity.ts'
import {
  createApiServer,
  JSON_RPC_MAX_REQUEST_BODY_SIZE,
} from '../src/api/server.ts'

const authSecret = 'testauthsecret32charslong0ab1234'

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
    proxy: {
      request: () => {
        throw new Error('unexpected proxy request')
      },
    },
  },
}

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

const jsonRpcBody = JSON.stringify({
  jsonrpc: '2.0',
  id: 1,
  method: 'eth_chainId',
  params: [],
})

function createServer(authSecret?: string) {
  return createApiServer({
    db: mockDb,
    config: {
      ...baseConfig,
      ...(authSecret ? { authSecret } : {}),
    } as never,
    logger: mockLogger,
  })
}

function createServerWithLogs() {
  const logs: Record<string, unknown>[] = []
  const logger = pino(
    { base: undefined, timestamp: false },
    {
      write(line) {
        logs.push(JSON.parse(line))
      },
    }
  )
  const app = createApiServer({
    db: mockDb,
    config: baseConfig as never,
    logger,
  })

  return { app, logs }
}

function completedRequest(logs: Record<string, unknown>[]) {
  return logs.find((log) => log.msg === 'Request completed')
}

test('all streamed methods share one immediate-rejection capacity limit', async () => {
  const logs: Record<string, unknown>[] = []
  const logger = pino(
    { base: undefined, timestamp: false },
    {
      write(line) {
        logs.push(JSON.parse(line))
      },
    }
  )
  const streamCapacity = new StreamCapacityLimiter(1)
  const heldPermit = streamCapacity.acquire()
  const app = createApiServer({
    db: mockDb,
    config: {
      ...baseConfig,
      maxConnections: 2,
      maxStreamConnections: 1,
    } as never,
    logger,
    streamCapacity,
  })
  const requests = [
    { method: 'eth_getBlockReceipts', params: ['0x1'] },
    { method: 'eth_getLogs', params: [{}] },
    {
      method: 'eth_getTransactionReceipt',
      params: [`0x${'1'.repeat(64)}`],
    },
  ]

  try {
    for (const [index, request] of requests.entries()) {
      const response = await app.request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: index + 1, ...request }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        id: index + 1,
        error: {
          code: -32005,
          data: { maxConcurrentStreams: 1 },
          message: 'Stream concurrency limit exceeded',
        },
      })
    }

    for (const [index, request] of [
      { method: 'eth_getBlockReceipts', params: ['0xzz'] },
      { method: 'eth_getLogs', params: [{ fromBlock: '0xzz' }] },
    ].entries()) {
      const response = await app.request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 100 + index, ...request }),
      })
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        id: 100 + index,
        error: { code: -32602, message: 'invalid block parameter' },
      })
    }
  } finally {
    heldPermit.release()
  }

  const rejections = logs.filter(
    (log) => log.msg === 'json-rpc stream rejected'
  )
  expect(rejections).toHaveLength(3)
  expect(rejections.map((log) => log.method)).toEqual(
    requests.map((request) => request.method)
  )
  expect(rejections[0]).toMatchObject({
    activeStreamConnections: 1,
    maxConnections: 2,
    maxStreamConnections: 1,
    rejectionReason: 'stream_concurrency_limit',
  })
})

describe('createApiServer auth', () => {
  test('without authSecret: POST / succeeds and /admin/keys returns 404', async () => {
    const app = createServer()

    const rpc = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: jsonRpcBody,
    })
    expect(rpc.status).toBe(200)

    const admin = await app.request('/admin/keys', { method: 'POST' })
    expect(admin.status).toBe(404)
  })

  test('without authSecret: GET /health succeeds', async () => {
    const app = createServer()
    const health = await app.request('/health')
    expect(health.status).toBe(200)
    expect(await health.json()).toMatchObject({ ok: true, chainId: 314_159 })
  })

  test('with authSecret: /admin/keys rejects missing or wrong secret', async () => {
    const app = createServer(authSecret)

    const missing = await app.request('/admin/keys', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sub: 'alice' }),
    })
    expect(missing.status).toBe(401)

    const wrong = await app.request('/admin/keys', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-secret',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sub: 'alice' }),
    })
    expect(wrong.status).toBe(401)
  })

  test('with authSecret: /admin/keys mints a JWT for a user', async () => {
    const app = createServer(authSecret)

    const response = await app.request('/admin/keys', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sub: 'alice', expiresInDays: 90 }),
    })

    expect(response.status).toBe(200)
    const body = await response.json()
    expect(body.sub).toBe('alice')
    expect(typeof body.token).toBe('string')
  })

  test('with authSecret: POST / rejects missing, invalid, and wrong-secret tokens', async () => {
    const app = createServer(authSecret)

    const missing = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: jsonRpcBody,
    })
    expect(missing.status).toBe(401)

    const invalid = await app.request('/', {
      method: 'POST',
      headers: {
        authorization: 'Bearer not-a-jwt',
        'content-type': 'application/json',
      },
      body: jsonRpcBody,
    })
    expect(invalid.status).toBe(401)

    const wrongSecretToken = await sign(
      { sub: 'alice', iat: Math.floor(Date.now() / 1000) },
      'differentsecret32charslong0ab12'
    )
    const wrongSecret = await app.request('/', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${wrongSecretToken}`,
        'content-type': 'application/json',
      },
      body: jsonRpcBody,
    })
    expect(wrongSecret.status).toBe(401)
  })

  test('with authSecret: POST / accepts ?token= query param', async () => {
    const app = createServer(authSecret)

    const mint = await app.request('/admin/keys', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sub: 'alice' }),
    })
    const { token } = await mint.json()

    const rpc = await app.request(`/?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: jsonRpcBody,
    })
    expect(rpc.status).toBe(200)
  })

  test('with authSecret: POST / rejects invalid ?token= query param', async () => {
    const app = createServer(authSecret)

    const rpc = await app.request('/?token=not-a-jwt', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: jsonRpcBody,
    })
    expect(rpc.status).toBe(401)
    expect(rpc.headers.get('www-authenticate')).not.toContain('not-a-jwt')
  })

  test('with authSecret: POST / prefers Authorization header over ?token=', async () => {
    const app = createServer(authSecret)

    const mint = await app.request('/admin/keys', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sub: 'alice' }),
    })
    const { token } = await mint.json()

    const rpc = await app.request(`/?token=not-a-jwt`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: jsonRpcBody,
    })
    expect(rpc.status).toBe(200)
  })

  test('with authSecret: POST / accepts a minted token', async () => {
    const app = createServer(authSecret)

    const mint = await app.request('/admin/keys', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${authSecret}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ sub: 'alice' }),
    })
    const { token } = await mint.json()

    const rpc = await app.request('/', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: jsonRpcBody,
    })
    expect(rpc.status).toBe(200)
  })

  test('with authSecret: POST / rejects an expired token', async () => {
    const app = createServer(authSecret)
    const now = Math.floor(Date.now() / 1000)
    const expiredToken = await sign(
      { sub: 'alice', iat: now - 100, exp: now - 1 },
      authSecret
    )

    const rpc = await app.request('/', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${expiredToken}`,
        'content-type': 'application/json',
      },
      body: jsonRpcBody,
    })
    expect(rpc.status).toBe(401)
  })

  test('with authSecret: unknown routes require auth', async () => {
    const app = createServer(authSecret)

    const response = await app.request('/unknown')
    expect(response.status).toBe(401)
  })

  test('with authSecret: GET /health succeeds without auth', async () => {
    const app = createServer(authSecret)
    const health = await app.request('/health')
    expect(health.status).toBe(200)
  })
})

describe('createApiServer JSON-RPC boundary', () => {
  test('requires a JSON content type', async () => {
    const response = await createServer().request('/', {
      method: 'POST',
      body: jsonRpcBody,
    })

    expect(response.status).toBe(415)
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32600,
        message: 'Content-Type must be application/json',
      },
    })
  })

  test('rejects oversized request bodies before parsing', async () => {
    const response = await createServer().request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'eth_call',
        params: ['x'.repeat(JSON_RPC_MAX_REQUEST_BODY_SIZE)],
      }),
    })

    expect(response.status).toBe(413)
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32600, message: 'Request body too large' },
    })
  })

  test('returns HTTP 200 for JSON-RPC method errors', async () => {
    const cases = [
      {
        request: { method: 'unknown_method', params: [] },
        error: { code: -32601, message: 'Method not found' },
      },
      {
        request: { method: 'eth_getBlockByNumber', params: ['0x'] },
        error: { code: -32602, message: 'invalid block parameter' },
      },
      {
        request: { method: 'eth_call', params: [] },
        error: { code: -32603, message: 'Internal error' },
      },
    ]

    for (const [index, item] of cases.entries()) {
      const response = await createServer().request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: index + 1,
          ...item.request,
        }),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        id: index + 1,
        error: item.error,
      })
    }
  })
})

describe('createApiServer request logging', () => {
  test('adds the JSON-RPC body without its envelope to a single request log', async () => {
    const { app, logs } = createServerWithLogs()
    const body = {
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_chainId',
      params: [],
      extension: { trace: true },
    }

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: '0x4cb2f',
    })
    expect(completedRequest(logs)).toMatchObject({
      jsonRpcBody: {
        method: 'eth_chainId',
        params: [],
        extension: { trace: true },
      },
    })
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcBody.jsonrpc')
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcBody.id')
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcMethod')
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcMethods')
  })

  test('rejects batches without adding JSON-RPC request metadata', async () => {
    const bodies = [
      [],
      [
        {
          jsonrpc: '2.0',
          id: 1,
          method: 'eth_chainId',
          params: [],
          extension: 'first',
        },
        { jsonrpc: '2.0', id: 2, method: 'net_version', params: ['kept'] },
        null,
        'invalid entry',
      ],
    ]

    for (const body of bodies) {
      const { app, logs } = createServerWithLogs()
      const response = await app.request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Batch requests are not supported' },
      })
      expect(completedRequest(logs)).not.toHaveProperty('jsonRpcBody')
      expect(completedRequest(logs)).not.toHaveProperty('jsonRpcMethod')
      expect(completedRequest(logs)).not.toHaveProperty('jsonRpcMethods')
    }
  })

  test('rejects invalid requests before streamed handler selection', async () => {
    const bodies = [
      null,
      {
        jsonrpc: '2.0',
        method: 'eth_getBlockReceipts',
        params: ['0x1'],
      },
    ]

    for (const body of bodies) {
      const { app, logs } = createServerWithLogs()
      const response = await app.request('/', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(200)
      expect(await response.json()).toEqual({
        jsonrpc: '2.0',
        id: null,
        error: { code: -32600, message: 'Invalid Request' },
      })
      expect(completedRequest(logs)).not.toHaveProperty('jsonRpcBody')
    }
  })

  test('does not add JSON-RPC metadata to non-RPC request logs', async () => {
    const { app, logs } = createServerWithLogs()

    const response = await app.request('/health')

    expect(response.status).toBe(200)
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcBody')
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcMethod')
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcMethods')
  })

  test('returns parse errors with HTTP 200 without JSON-RPC metadata', async () => {
    const { app, logs } = createServerWithLogs()

    const response = await app.request('/', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{',
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({
      jsonrpc: '2.0',
      id: null,
      error: { code: -32700, message: 'Parse error' },
    })
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcBody')
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcMethod')
    expect(completedRequest(logs)).not.toHaveProperty('jsonRpcMethods')
  })
})
