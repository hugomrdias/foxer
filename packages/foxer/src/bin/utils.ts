import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { type LilconfigResult, lilconfig } from 'lilconfig'

import type { InternalConfig } from '../config/config'
import type { Logger } from '../utils/logger'

const CLI_NAME = 'foxer'

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

export async function loadConfig(
  logger: Logger,
  root: string,
  filePath?: string
) {
  let configFile: LilconfigResult | undefined

  try {
    if (filePath) {
      const configPath = path.resolve(root, filePath)

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
    logger.error(error, 'config evaluation failed')
    // ignore
  }

  if (!configFile || configFile.isEmpty) {
    logger.error({
      msg: 'Config file not found',
    })
    process.exit(1)
  }

  return configFile.config.config as InternalConfig
}
