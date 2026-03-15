import path from 'node:path'
import {
  type LoadConfigResult,
  loadConfig as unconfigLoadConfig,
} from 'unconfig'

import type { InternalConfig } from '../config/config'
import type { Logger } from '../utils/logger'

const CLI_NAME = 'foxer'

export async function loadConfig(
  logger: Logger,
  root: string,
  filePath?: string
) {
  let configFile: LoadConfigResult<{ config: InternalConfig }> | undefined

  try {
    if (filePath) {
      const configPath = path.resolve(root, filePath)

      configFile = await unconfigLoadConfig({
        sources: [
          {
            files: configPath,
          },
        ],
      })
    } else {
      configFile = await unconfigLoadConfig({
        sources: [
          {
            files: `${CLI_NAME}.config`,
          },
        ],
      })
    }
  } catch (error) {
    logger.error({ error }, 'config evaluation failed')
    // ignore
  }

  if (!configFile) {
    logger.error({
      msg: 'Config file not found',
    })
    process.exit(1)
  }

  return configFile.config.config as InternalConfig
}
