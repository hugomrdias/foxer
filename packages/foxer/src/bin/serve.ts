import { type Command, command } from 'cleye'
import { gracefulExit } from 'exit-hook'

import { createApi } from '../api/create-api.ts'
import { createEnv } from '../config/env.ts'
import { createDatabase } from '../db/client.ts'
import * as InternalSchema from '../db/schema/index.ts'
import { createLogger } from '../utils/logger.ts'
import { createExit } from '../utils/shutdown.ts'
import { globalFlags } from './flags.ts'
import { loadConfig } from './utils.ts'

export const serve: Command = command(
  {
    name: 'serve',
    flags: { ...globalFlags },
    help: {
      description: 'Serve the production HTTP API and without the indexer',
    },
  },
  async (argv) => {
    const logger = createLogger({
      level: argv.flags.logLevel,
      mode: 'json',
    })

    if (process.env.DATABASE_URL == null) {
      logger.error('DATABASE_URL environment variable is not set')
      gracefulExit(1)
    }

    try {
      const env = createEnv(logger)
      const config = await loadConfig(logger, argv.flags.root, argv.flags.config)

      const dbContext = createDatabase({
        env,
        schema: { ...config.schema, ...InternalSchema.schema },
        relations: { ...config.relations, ...InternalSchema.relations },
      })

      const api = createApi({
        db: dbContext.db,
        config,
        logger,
        port: argv.flags.port,
      })

      createExit({
        logger,
        stop: async () => {
          api.stop()
          await dbContext.stop()
        },
      })
    } catch (error) {
      logger.error({ error }, 'HTTP API server failed')
      gracefulExit(1)
    }
  },
)
