import { expect, mock, test } from 'bun:test'

import { runServer, type ServerDependencies } from '../src/bin/run.ts'
import type { InternalConfig } from '../src/config.ts'
import type { Database, DatabaseContext } from '../src/db/client.ts'
import type { Logger } from '../src/utils/logger.ts'

const config = {
  clients: {
    backfill: {},
    live: {},
  },
  databaseUrl: 'postgres://localhost/foxer_rpc',
  finality: 30n,
  maxConnections: 17,
  port: 8545,
} as InternalConfig

function createDependencies(options?: {
  migrationError?: Error
  onCreateExit?: (stop: () => Promise<void>) => void
  onLeaseLost?: (onLost: (error: Error) => void) => void
}) {
  const calls: string[] = []
  const syncDatabase = {
    db: {} as Database,
    stop: mock(() => {
      calls.push('sync-database.stop')
      return Promise.resolve()
    }),
  } satisfies DatabaseContext
  const apiDatabase = {
    db: {} as Database,
    stop: mock(() => {
      calls.push('api-database.stop')
      return Promise.resolve()
    }),
  } satisfies DatabaseContext
  const gracefulExit = mock((_code: number) => undefined)
  const logger = {
    debug: mock(),
    error: mock(),
    info: mock(),
    warn: mock(),
  } as unknown as Logger

  const dependencies = {
    acquireSyncLease: mock(({ onLost }) => {
      calls.push('lease.acquire')
      options?.onLeaseLost?.(onLost)
      return Promise.resolve({
        release: mock(() => {
          calls.push('lease.release')
          return Promise.resolve()
        }),
      })
    }),
    createApi: mock(() => {
      calls.push('api.start')
      return {
        stop: mock(() => {
          calls.push('api.stop')
          return Promise.resolve()
        }),
      }
    }),
    createConfig: mock(() => {
      calls.push('config.create')
      return Promise.resolve(config)
    }),
    createDatabase: mock(({ role }) => {
      calls.push(`${role}-database.create`)
      return role === 'sync' ? syncDatabase : apiDatabase
    }),
    createExit: mock(({ stop }) => {
      calls.push('shutdown.register')
      options?.onCreateExit?.(stop)
    }),
    gracefulExit,
    runBackfill: mock(() => {
      calls.push('backfill.run')
      return Promise.resolve(100n)
    }),
    runMigrations: mock(() => {
      calls.push('migrations.run')
      return options?.migrationError
        ? Promise.reject(options.migrationError)
        : Promise.resolve()
    }),
    startLiveSync: mock(() => {
      calls.push('live.start')
      return {
        stop: mock(() => {
          calls.push('live.stop')
          return Promise.resolve()
        }),
      }
    }),
    verifyRecentBlocks: mock(() => {
      calls.push('verification.run')
      return Promise.resolve()
    }),
  } as unknown as ServerDependencies

  return { calls, dependencies, gracefulExit, logger }
}

test('holds the sync lease across startup and releases it last on shutdown', async () => {
  let shutdown: (() => Promise<void>) | undefined
  let onLeaseLost: ((error: Error) => void) | undefined
  const { calls, dependencies, gracefulExit, logger } = createDependencies({
    onCreateExit: (stop) => {
      shutdown = stop
    },
    onLeaseLost: (callback) => {
      onLeaseLost = callback
    },
  })

  await runServer({ logger, flags: {} }, dependencies)

  expect(calls).toEqual([
    'config.create',
    'shutdown.register',
    'lease.acquire',
    'sync-database.create',
    'migrations.run',
    'verification.run',
    'backfill.run',
    'api-database.create',
    'live.start',
    'api.start',
  ])

  const leaseError = new Error('lease connection closed')
  onLeaseLost?.(leaseError)
  expect(logger.error).toHaveBeenCalledWith(
    { error: leaseError },
    'sync lease connection lost'
  )
  expect(gracefulExit).toHaveBeenCalledWith(1)

  await shutdown?.()
  expect(calls).toEqual([
    'config.create',
    'shutdown.register',
    'lease.acquire',
    'sync-database.create',
    'migrations.run',
    'verification.run',
    'backfill.run',
    'api-database.create',
    'live.start',
    'api.start',
    'live.stop',
    'api.stop',
    'api-database.stop',
    'sync-database.stop',
    'lease.release',
  ])
})

test('releases the sync lease when startup fails', async () => {
  const migrationError = new Error('migration failed')
  const { calls, dependencies, logger } = createDependencies({ migrationError })

  await expect(runServer({ logger, flags: {} }, dependencies)).rejects.toBe(
    migrationError
  )
  expect(calls).toEqual([
    'config.create',
    'shutdown.register',
    'lease.acquire',
    'sync-database.create',
    'migrations.run',
    'sync-database.stop',
    'lease.release',
  ])
})
