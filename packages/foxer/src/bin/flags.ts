import path from 'node:path'

const Root = (dir: string) => {
  return path.resolve(dir)
}

const possibleLogModes = ['pretty', 'json'] as const

type LogModes = (typeof possibleLogModes)[number]

// Custom type function
const LogMode = (logMode: LogModes) => {
  if (!possibleLogModes.includes(logMode)) {
    throw new Error(`Invalid log mode: "${logMode}"`)
  }

  return logMode
}

const LogLevels = [
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
  'silent',
] as const
type LogLevels = (typeof LogLevels)[number]

// Custom type function
const LogLevel = (logLevel: LogLevels) => {
  if (!LogLevels.includes(logLevel)) {
    throw new Error(`Invalid log level: "${logLevel}"`)
  }

  return logLevel
}
export const globalFlags = {
  config: {
    type: String,
    description: 'The path to the config file',
  },
  root: {
    type: Root,
    description: 'The root directory of the project',
    default: process.cwd(),
  },

  logLevel: {
    type: LogLevel,
    description: 'The log level to use',
    default: LogLevel((process.env.LOG_LEVEL as LogLevels) ?? 'info'),
  },
  logMode: {
    type: LogMode,
    description: 'The log mode to use',
    default: LogMode(process.env.NODE_ENV !== 'production' ? 'pretty' : 'json'),
  },
} as const
