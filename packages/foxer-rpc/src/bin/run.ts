import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { gracefulExit } from 'exit-hook'

import { createApi } from '../api/create-api.ts'
import { type CliConfig, createConfig } from '../config.ts'
import { createDatabase, type DatabaseContext } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import { acquireSyncLease, type SyncLease } from '../db/sync-lease.ts'
import { runBackfill } from '../sync/backfill.ts'
import { startLiveSync } from '../sync/live.ts'
import { verifyRecentBlocks } from '../sync/reorg.ts'
import type { Logger } from '../utils/logger.ts'
import { createExit } from '../utils/shutdown.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../drizzle')

export type ServerDependencies = {
  acquireSyncLease: typeof acquireSyncLease
  createApi: typeof createApi
  createConfig: typeof createConfig
  createDatabase: typeof createDatabase
  createExit: typeof createExit
  gracefulExit: typeof gracefulExit
  runBackfill: typeof runBackfill
  runMigrations: typeof runMigrations
  startLiveSync: typeof startLiveSync
  verifyRecentBlocks: typeof verifyRecentBlocks
}

const defaultDependencies: ServerDependencies = {
  acquireSyncLease,
  createApi,
  createConfig,
  createDatabase,
  createExit,
  gracefulExit,
  runBackfill,
  runMigrations,
  startLiveSync,
  verifyRecentBlocks,
}

/**
 * Shared runtime for both `foxer-rpc dev` and `foxer-rpc start`.
 *
 * This resolves config, acquires the singleton sync lease, applies shipped
 * migrations, starts the HTTP API and sync engine, and registers process
 * shutdown before waiting for ownership so rolling deploys can hand off safely.
 */
export async function runServer(
  args: { logger: Logger; flags: CliConfig },
  dependencies: ServerDependencies = defaultDependencies
) {
  const config = await dependencies.createConfig(args.flags)
  const shutdownController = new AbortController()
  let syncLease: SyncLease | undefined
  let syncDbContext: DatabaseContext | undefined
  let apiDbContext: DatabaseContext | undefined
  let api: ReturnType<typeof createApi> | undefined
  let sync: ReturnType<typeof startLiveSync> | undefined
  let stopPromise: Promise<void> | undefined

  const stopServices = async () => {
    const errors: unknown[] = []

    if (sync) {
      try {
        await sync.stop()
      } catch (err) {
        errors.push(err)
      }
    }

    if (api) {
      try {
        await api.stop()
      } catch (err) {
        errors.push(err)
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'service shutdown failed')
    }
  }

  const stopDatabases = async () => {
    const errors: unknown[] = []

    if (apiDbContext) {
      try {
        await apiDbContext.stop()
      } catch (err) {
        errors.push(err)
      }
    }

    if (syncDbContext) {
      try {
        await syncDbContext.stop()
      } catch (err) {
        errors.push(err)
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'database shutdown failed')
    }
  }

  const stopResources = async () => {
    const errors: unknown[] = []

    try {
      await stopServices()
    } catch (err) {
      errors.push(err)
    }

    try {
      await stopDatabases()
    } catch (err) {
      errors.push(err)
    }

    if (syncLease) {
      try {
        await syncLease.release()
      } catch (err) {
        errors.push(err)
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'shutdown failed')
    }
  }

  const stopAll = () => {
    shutdownController.abort()
    stopPromise ??= stopResources()
    return stopPromise
  }

  try {
    dependencies.createExit({
      logger: args.logger,
      stop: stopAll,
    })

    syncLease = await dependencies.acquireSyncLease({
      databaseUrl: config.databaseUrl,
      logger: args.logger,
      signal: shutdownController.signal,
      onLost: (error) => {
        args.logger.error({ error }, 'sync lease connection lost')
        dependencies.gracefulExit(1)
      },
    })
    shutdownController.signal.throwIfAborted()

    syncDbContext = dependencies.createDatabase({
      databaseUrl: config.databaseUrl,
      logger: args.logger,
      role: 'sync',
    })

    await dependencies.runMigrations({
      dbContext: syncDbContext,
      folder: migrationsFolder,
      logger: args.logger,
    })
    shutdownController.signal.throwIfAborted()

    await dependencies.verifyRecentBlocks({
      logger: args.logger,
      db: syncDbContext.db,
      client: config.clients.backfill,
      depth: config.finality,
    })
    shutdownController.signal.throwIfAborted()

    const nextCursor = await dependencies.runBackfill({
      logger: args.logger,
      db: syncDbContext.db,
      config,
    })
    shutdownController.signal.throwIfAborted()

    apiDbContext = dependencies.createDatabase({
      databaseUrl: config.databaseUrl,
      logger: args.logger,
      role: 'api',
      maxConnections: config.maxConnections,
    })

    sync = dependencies.startLiveSync({
      logger: args.logger,
      config,
      db: syncDbContext.db,
      client: config.clients.live,
      initialCursor: nextCursor,
    })
    api = dependencies.createApi({
      db: apiDbContext.db,
      config,
      logger: args.logger,
      port: config.port,
    })
  } catch (err) {
    try {
      await stopAll()
    } catch (cleanupErr) {
      throw new AggregateError(
        [err, cleanupErr],
        'startup failed and cleanup also failed'
      )
    }
    throw err
  }
}
