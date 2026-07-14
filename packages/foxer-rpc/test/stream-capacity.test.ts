import { expect, mock, test } from 'bun:test'
import { LogStreamSession } from '../src/api/json-rpc/methods/log-stream-session.ts'
import {
  StreamCapacityExceededError,
  StreamCapacityLimiter,
} from '../src/api/json-rpc/stream-capacity.ts'
import type { Database } from '../src/db/client.ts'
import { withTestDatabase } from './helpers.ts'

test('rejects synchronously at capacity and releases permits idempotently', () => {
  const capacity = new StreamCapacityLimiter(1)
  const permit = capacity.acquire()

  expect(capacity.active).toBe(1)
  expect(() => capacity.acquire()).toThrow(StreamCapacityExceededError)

  permit.release()
  permit.release()
  expect(capacity.active).toBe(0)

  const next = capacity.acquire()
  expect(next).toBeDefined()
  next.release()
})

test('maps each permit to one checked-out stream connection', async () => {
  await withTestDatabase(async (db) => {
    const capacity = new StreamCapacityLimiter(1)
    const first = await LogStreamSession.open(db, capacity)

    expect(capacity.active).toBe(1)
    expect(db.$client.waitingCount).toBe(0)
    await expect(LogStreamSession.open(db, capacity)).rejects.toMatchObject({
      code: -32005,
      data: { maxConcurrentStreams: 1 },
      message: 'Stream concurrency limit exceeded',
    })
    expect(db.$client.waitingCount).toBe(0)

    // Non-streamed work still has access to the remainder of the API pool.
    await expect(db.$client.query('select 1')).resolves.toBeDefined()

    await first.rollback()
    expect(capacity.active).toBe(0)

    const next = await LogStreamSession.open(db, capacity)
    await next.commit()
    expect(capacity.active).toBe(0)
  })
})

test('returns capacity when starting the snapshot transaction fails', async () => {
  const capacity = new StreamCapacityLimiter(1)
  const failure = new Error('begin failed')
  const release = mock(() => undefined)
  const db = {
    $client: {
      connect: () =>
        Promise.resolve({
          query: () => Promise.reject(failure),
          release,
        }),
    },
  } as unknown as Database

  await expect(LogStreamSession.open(db, capacity)).rejects.toBe(failure)
  expect(release).toHaveBeenCalledWith(true)
  expect(capacity.active).toBe(0)
})
