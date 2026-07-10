import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { createApi } from '../api/create-api.ts'
import { type CliConfig, createConfig } from '../config.ts'
import { createDatabase } from '../db/client.ts'
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
  const dbContext = createDatabase({
    config: config.database,
    logger: args.logger,
  })

  await runMigrations({
    dbContext,
    folder: migrationsFolder,
    logger: args.logger,
  })

  await verifyRecentBlocks({
    logger: args.logger,
    db: dbContext.db,
    client: config.clients.backfill,
    depth: config.finality,
  })

  const nextCursor = await runBackfill({
    logger: args.logger,
    db: dbContext.db,
    config,
  })

  const api = createApi({
    db: dbContext.db,
    config,
    logger: args.logger,
    port: config.port,
  })
  const sync = startLiveSync({
    logger: args.logger,
    config,
    db: dbContext.db,
    client: config.clients.live,
    initialCursor: nextCursor,
  })

  createExit({
    logger: args.logger,
    stop: async () => {
      sync.stop()
      api.stop()
      await dbContext.stop()
    },
  })
}
