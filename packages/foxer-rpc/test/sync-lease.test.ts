import { expect, test } from 'bun:test'

import { acquireSyncLease, type SyncLease } from '../src/db/sync-lease.ts'
import type { Logger } from '../src/utils/logger.ts'
import { createTestDatabaseContext } from './postgres.ts'
import { testLogger } from './test-logger.ts'

test('serializes sync writers and transfers the lease after release', async () => {
  const dbContext = await createTestDatabaseContext()
  let firstLease: SyncLease | undefined
  let secondLease: SyncLease | undefined
  let notifyWaiting: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    notifyWaiting = resolve
  })
  const waitingLogger = {
    debug: () => undefined,
    error: () => undefined,
    info(message: string) {
      if (message === 'waiting for existing sync writer to release its lease') {
        notifyWaiting?.()
      }
    },
    warn: () => undefined,
  } as unknown as Logger

  try {
    firstLease = await acquireSyncLease({
      databaseUrl: dbContext.databaseUrl,
      logger: testLogger,
      onLost: () => undefined,
    })
    const secondLeasePromise = acquireSyncLease({
      databaseUrl: dbContext.databaseUrl,
      logger: waitingLogger,
      onLost: () => undefined,
      retryDelayMs: 10,
    })

    await waiting
    await firstLease.release()
    firstLease = undefined
    secondLease = await secondLeasePromise
  } finally {
    await secondLease?.release()
    await firstLease?.release()
    await dbContext.stop()
  }
})

test('aborts a waiting lease without retaining a PostgreSQL session', async () => {
  const dbContext = await createTestDatabaseContext()
  const controller = new AbortController()
  let firstLease: SyncLease | undefined
  let finalLease: SyncLease | undefined
  let notifyWaiting: (() => void) | undefined
  const waiting = new Promise<void>((resolve) => {
    notifyWaiting = resolve
  })
  const waitingLogger = {
    debug: () => undefined,
    error: () => undefined,
    info(message: string) {
      if (message === 'waiting for existing sync writer to release its lease') {
        notifyWaiting?.()
      }
    },
    warn: () => undefined,
  } as unknown as Logger

  try {
    firstLease = await acquireSyncLease({
      databaseUrl: dbContext.databaseUrl,
      logger: testLogger,
      onLost: () => undefined,
    })
    const waitingLease = acquireSyncLease({
      databaseUrl: dbContext.databaseUrl,
      logger: waitingLogger,
      onLost: () => undefined,
      retryDelayMs: 10,
      signal: controller.signal,
    })

    await waiting
    controller.abort()
    await expect(waitingLease).rejects.toHaveProperty('name', 'AbortError')
    const activeLeaseSessions = await dbContext.db.$client.query<{
      count: string
    }>(
      `SELECT count(*) AS count
       FROM pg_stat_activity
       WHERE application_name = 'foxer-rpc-sync-lease'`
    )
    expect(Number(activeLeaseSessions.rows[0]?.count)).toBe(1)

    await firstLease.release()
    firstLease = undefined
    finalLease = await acquireSyncLease({
      databaseUrl: dbContext.databaseUrl,
      logger: testLogger,
      onLost: () => undefined,
    })
  } finally {
    await finalLease?.release()
    await firstLease?.release()
    await dbContext.stop()
  }
})
