import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createApi } from '../api/create-api.ts'
import { type CliConfig, createConfig } from '../config.ts'
import { createDatabase, type DatabaseContext } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import { runBackfill } from '../sync/backfill.ts'
import { startLiveSync } from '../sync/live.ts'
import { verifyRecentBlocks } from '../sync/reorg.ts'
import type { Logger } from '../utils/logger.ts'
import { createExit } from '../utils/shutdown.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const migrationsFolder = resolve(__dirname, '../../drizzle')

/**
 * Shared runtime for both `foxer-rpc dev` and `foxer-rpc start`.
 *
 * This resolves config, opens the database, applies shipped migrations, starts
 * the HTTP API and sync engine concurrently, and registers process shutdown
 * hooks that stop live watching, the server, and the database.
 */
export async function runServer(args: { logger: Logger; flags: CliConfig }) {
  const config = await createConfig(args.flags)
  let syncDbContext: DatabaseContext | undefined
  let apiDbContext: DatabaseContext | undefined
  let api: ReturnType<typeof createApi> | undefined
  let sync: ReturnType<typeof startLiveSync> | undefined

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

  const stopAll = async () => {
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

    if (errors.length > 0) {
      throw new AggregateError(errors, 'shutdown failed')
    }
  }

  try {
    syncDbContext = createDatabase({
      databaseUrl: config.databaseUrl,
      logger: args.logger,
      role: 'sync',
    })

    await runMigrations({
      dbContext: syncDbContext,
      folder: migrationsFolder,
      logger: args.logger,
    })

    await verifyRecentBlocks({
      logger: args.logger,
      db: syncDbContext.db,
      client: config.clients.backfill,
      depth: config.finality,
    })

    const nextCursor = await runBackfill({
      logger: args.logger,
      db: syncDbContext.db,
      config,
    })

    apiDbContext = createDatabase({
      databaseUrl: config.databaseUrl,
      logger: args.logger,
      role: 'api',
      maxConnections: config.maxConnections,
    })

    sync = startLiveSync({
      logger: args.logger,
      config,
      db: syncDbContext.db,
      client: config.clients.live,
      initialCursor: nextCursor,
    })
    api = createApi({
      db: apiDbContext.db,
      config,
      logger: args.logger,
      port: config.port,
    })

    createExit({
      logger: args.logger,
      stop: stopAll,
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
