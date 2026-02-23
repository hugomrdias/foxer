import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { type Command, command } from 'cleye'
import { gracefulExit } from 'exit-hook'
import { type LilconfigResult, lilconfig } from 'lilconfig'
import { bootstrapApiServer } from '../api/runner.ts'
import { createDatabase } from '../db/client.ts'
import { runMigrations } from '../db/migrate.ts'
import * as InternalSchema from '../db/schema/index.ts'
import { HookRegistry } from '../hooks/registry.ts'
import { bootstrapIndexer } from '../indexer/runner.ts'
import { createComponentLogger } from '../logger.ts'
import { createRpcClient } from '../rpc/client.ts'
import { createExit, registerUnhandled } from '../utils/shutdown.ts'
import type { InternalConfig } from '../utils/types.ts'
import { globalFlags } from './flags.ts'

const loadEsm = async (filepath: string) => {
  const res = await import(pathToFileURL(filepath).href)
  return res.default ?? res
}

const configLoaders = {
  '.js': loadEsm,
  '.mjs': loadEsm,
  '.ts': loadEsm,
  '.mts': loadEsm,
}

const CLI_NAME = 'foxer'

export const dev: Command = command(
  {
    name: 'dev',
    flags: { ...globalFlags },
    help: {
      description: 'Start the development server with hot reloading',
    },
  },
  async (argv) => {
    const log = createComponentLogger('dev')
    registerUnhandled({ logger: log })

    if (!fs.existsSync(path.join(argv.flags.root, '.env.local'))) {
      log.warn({
        msg: 'Local environment file (.env.local) not found',
      })
    }

    let configFile: LilconfigResult | undefined

    try {
      if (argv.flags.config) {
        const configPath = path.resolve(argv.flags.root, argv.flags.config)

        configFile = await lilconfig(configPath, {
          loaders: configLoaders,
          searchPlaces: [],
        }).load(configPath)
      } else {
        configFile = await lilconfig(CLI_NAME, {
          loaders: configLoaders,
          searchPlaces: [`${CLI_NAME}.config.ts`, `${CLI_NAME}.config.mts`],
        }).search()
      }
    } catch (error) {
      log.error(error, 'config evaluation failed')
      // ignore
    }

    if (!configFile || configFile.isEmpty) {
      log.error({
        msg: 'Config file not found',
      })
      process.exit(1)
    }

    try {
      const config = configFile.config.config as InternalConfig
      const dbContext = createDatabase({
        schema: { ...config.schema, ...InternalSchema.schema },
        relations: { ...config.relations, ...InternalSchema.relations },
      })

      await runMigrations({ dbContext, drizzleFolder: config.drizzleFolder })

      const client = createRpcClient()

      const registry = new HookRegistry()
      config.hooks({ registry })

      const [api, indexer] = await Promise.all([
        bootstrapApiServer({
          db: dbContext.db,
          config,
        }),
        bootstrapIndexer({
          db: dbContext.db,
          client,
          registry,
          config,
        }),
      ])

      createExit({
        logger: log,
        stop: async () => {
          indexer.stop()
          api.stop()
          await dbContext.close()
        },
      })
    } catch (error) {
      log.error({ err: error }, 'dev server failed')
      gracefulExit(1)
    }
  }
)
