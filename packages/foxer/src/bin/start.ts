import path from 'node:path'
import { type Command, command } from 'cleye'
import { gracefulExit } from 'exit-hook'
import { createApi } from '../api/create-api.ts'
import { createEnv } from '../config/env.ts'
import { createDatabase } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import * as InternalSchema from '../db/schema/index.ts'
import { createRegistry } from '../hooks/registry.ts'
import { createIndexer } from '../indexer/create-indexer.ts'
import { createLogger } from '../utils/logger.ts'
import { createExit } from '../utils/shutdown.ts'
import { globalFlags } from './flags.ts'
import { loadConfig } from './utils.ts'

export const start: Command = command(
  {
    name: 'start',
    flags: { ...globalFlags },
    help: {
      description: 'Start the production server',
    },
  },
  async (argv) => {
    const logger = createLogger({
      level: argv.flags.logLevel,
      mode: 'json',
    })

    if (process.env.DATABASE_URL != null) {
      logger.error('DATABASE_URL environment variable is not set')
      gracefulExit(1)
    }

    try {
      const env = createEnv(logger)
      const config = await loadConfig(
        logger,
        argv.flags.root,
        argv.flags.config
      )

      const dbContext = createDatabase({
        env,
        schema: { ...config.schema, ...InternalSchema.schema },
        relations: { ...config.relations, ...InternalSchema.relations },
      })

      await runMigrations({
        dbContext,
        folder: path.resolve(argv.flags.root, config.drizzleFolder),
        logger,
      })

      const registry = createRegistry({ config })

      const [api, indexer] = await Promise.all([
        createApi({
          db: dbContext.db,
          config,
          logger,
          port: argv.flags.port,
        }),
        createIndexer({
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
          await dbContext.stop()
        },
      })
    } catch (error) {
      logger.error({ error }, 'start server failed')
      gracefulExit(1)
    }
  }
)
