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

const LogLevel = (logLevel: LogLevels) => {
  if (!LogLevels.includes(logLevel)) {
    throw new Error(`Invalid log level: "${logLevel}"`)
  }

  return logLevel
}

export const globalFlags = {
  rpcUrl: {
    type: String,
    description: 'The upstream Ethereum JSON-RPC URL',
  },
  realtimeRpcUrl: {
    type: String,
    description: 'Optional upstream RPC URL for live polling',
  },
  databaseUrl: {
    type: String,
    description: 'Postgres connection URL',
  },
  dir: {
    type: String,
    description: 'PGlite directory for dev mode',
    default: '.pglite',
  },
  startBlock: {
    type: String,
    description: 'First block to sync',
  },
  finality: {
    type: String,
    description: 'Finality depth to leave behind chain head',
  },
  batchSize: {
    type: String,
    description: 'Backfill block batch size',
  },
  maxLogsBlockRange: {
    type: String,
    description: 'Maximum eth_getLogs block range',
  },
  maxLogsResultRows: {
    type: Number,
    description: 'Maximum eth_getLogs result rows',
  },
  logLevel: {
    type: LogLevel,
    description: 'The log level to use',
    default: LogLevel((process.env.LOG_LEVEL as LogLevels) ?? 'info'),
  },
  port: {
    type: Number,
    description: 'The port to use for the JSON-RPC server',
    default: process.env.PORT ? Number(process.env.PORT) : 8545,
  },
  authSecret: {
    type: String,
    description: 'Secret used to mint and verify JWT API keys (enables auth)',
  },
  deferBackfillIndexes: {
    type: Boolean,
    description:
      'Drop and rebuild non-constraint indexes during large historical backfills',
  },
} as const
