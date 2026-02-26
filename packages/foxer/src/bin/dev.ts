import fs from 'node:fs'
import path from 'node:path'
import { type Command, command } from 'cleye'
import { gracefulExit } from 'exit-hook'
import { bootstrapApiServer } from '../api/runner.ts'
import { createEnv } from '../config/env.ts'
import { createDatabase } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import * as InternalSchema from '../db/schema/index.ts'
import { HookRegistry } from '../hooks/registry.ts'
import { bootstrapIndexer } from '../indexer/runner.ts'
import { createLogger } from '../utils/logger.ts'
import { createExit, registerUnhandled } from '../utils/shutdown.ts'
import { globalFlags } from './flags.ts'
import { loadConfig } from './utils.ts'

export const dev: Command = command(
  {
    name: 'dev',
    flags: { ...globalFlags },
    help: {
      description: 'Start the development server with hot reloading',
    },
  },
  async (argv) => {
    const logger = createLogger({
      level: argv.flags.logLevel,
      mode: argv.flags.logMode,
    })

    registerUnhandled({ logger })

    if (!fs.existsSync(path.join(argv.flags.root, '.env.local'))) {
      logger.warn({
        msg: 'Local environment file (.env.local) not found',
      })
    }
    const env = createEnv(logger)

    const config = await loadConfig(logger, argv.flags.root, argv.flags.config)

    try {
      const dbContext = createDatabase({
        env,
        schema: { ...config.schema, ...InternalSchema.schema },
        relations: { ...config.relations, ...InternalSchema.relations },
      })

      await runMigrations({
        dbContext,
        drizzleFolder: config.drizzleFolder,
        logger,
      })

      const registry = new HookRegistry()
      config.hooks({ registry })

      const [api, indexer] = await Promise.all([
        bootstrapApiServer({
          env,
          db: dbContext.db,
          config,
          logger,
        }),
        bootstrapIndexer({
          env,
          logger,
          db: dbContext.db,
          registry,
          config,
        }),
      ])

      createExit({
        logger,
        stop: async () => {
          indexer.stop()
          api.stop()
          await dbContext.close()
        },
      })
    } catch (error) {
      logger.error({ error }, 'dev server failed')
      gracefulExit(1)
    }
  }
)
