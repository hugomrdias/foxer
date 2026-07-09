import { type Command, command } from 'cleye'
import { gracefulExit } from 'exit-hook'

import { createLogger } from '../utils/logger.ts'
import { globalFlags } from './flags.ts'
import { runServer } from './run.ts'

export const dev: Command = command(
  {
    name: 'dev',
    flags: { ...globalFlags },
    help: {
      description: 'Start the development JSON-RPC server',
    },
  },
  async (argv) => {
    const logger = createLogger({
      level: argv.flags.logLevel,
      mode: 'pretty',
    })

    try {
      await runServer({
        logger,
        flags: {
          ...argv.flags,
          pgliteDir: argv.flags.dir,
        },
      })
    } catch (error) {
      logger.error({ error }, 'dev server failed')
      gracefulExit(1)
    }
  }
)
