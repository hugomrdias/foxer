import { type Command, command } from 'cleye'
import { gracefulExit } from 'exit-hook'

import { createApi } from '../api/create-api.ts'
import { type CliConfig, createConfig } from '../config.ts'
import { createDatabase, type DatabaseContext } from '../db/client.ts'
import { createLogger, type Logger } from '../utils/logger.ts'
import { createExit } from '../utils/shutdown.ts'
import { globalFlags } from './flags.ts'

export type ApiServerDependencies = {
  createApi: typeof createApi
  createConfig: typeof createConfig
  createDatabase: typeof createDatabase
  createExit: typeof createExit
}

const defaultDependencies: ApiServerDependencies = {
  createApi,
  createConfig,
  createDatabase,
  createExit,
}

/** Starts only the production JSON-RPC API against an already migrated database. */
export async function runApiServer(
  args: { logger: Logger; flags: CliConfig },
  dependencies: ApiServerDependencies = defaultDependencies
) {
  const config = await dependencies.createConfig(args.flags)
  let dbContext: DatabaseContext | undefined
  let api: ReturnType<typeof createApi> | undefined

  const stop = async () => {
    const errors: unknown[] = []

    if (api) {
      try {
        await api.stop()
      } catch (err) {
        errors.push(err)
      }
    }

    if (dbContext) {
      try {
        await dbContext.stop()
      } catch (err) {
        errors.push(err)
      }
    }

    if (errors.length > 0) {
      throw new AggregateError(errors, 'shutdown failed')
    }
  }

  try {
    dbContext = dependencies.createDatabase({
      databaseUrl: config.databaseUrl,
      logger: args.logger,
      role: 'api',
      maxConnections: config.maxConnections,
    })
    api = dependencies.createApi({
      db: dbContext.db,
      config,
      logger: args.logger,
      port: config.port,
    })

    dependencies.createExit({
      logger: args.logger,
      stop,
    })
  } catch (err) {
    try {
      await stop()
    } catch (cleanupErr) {
      throw new AggregateError(
        [err, cleanupErr],
        'startup failed and cleanup also failed'
      )
    }
    throw err
  }
}

export const serve: Command = command(
  {
    name: 'serve',
    flags: { ...globalFlags },
    help: {
      description: 'Serve the production JSON-RPC API without sync',
    },
  },
  async (argv) => {
    const logger = createLogger({
      level: argv.flags.logLevel,
      mode: 'json',
    })

    try {
      await runApiServer({
        logger,
        flags: argv.flags,
      })
    } catch (error) {
      logger.error({ error }, 'serve API failed')
      gracefulExit(1)
    }
  }
)
