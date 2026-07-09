import { type Command, command } from 'cleye'
import { gracefulExit } from 'exit-hook'

import { createLogger } from '../utils/logger.ts'
import { globalFlags } from './flags.ts'
import { runServer } from './run.ts'

export const start: Command = command(
  {
    name: 'start',
    flags: { ...globalFlags },
    help: {
      description: 'Start the production JSON-RPC server',
    },
  },
  async (argv) => {
    const logger = createLogger({
      level: argv.flags.logLevel,
      mode: 'json',
    })

    if (!argv.flags.databaseUrl && !process.env.DATABASE_URL) {
      logger.error('DATABASE_URL environment variable is not set')
      gracefulExit(1)
    }

    try {
      await runServer({
        logger,
        flags: argv.flags,
      })
    } catch (error) {
      logger.error({ error }, 'start server failed')
      gracefulExit(1)
    }
  }
)
