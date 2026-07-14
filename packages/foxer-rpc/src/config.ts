import dotenv from 'dotenv'
import { z } from 'zod'

import { createRpcClients, type RpcClients } from './rpc/client.ts'
import type { LogLevel } from './utils/logger.ts'

dotenv.config({
  path: '.env.local',
  quiet: true,
})

export type InternalConfig = {
  databaseUrl: string
  startBlock: bigint
  finality: bigint
  maxLogsBlockRange: bigint
  deferBackfillIndexes: boolean
  backfillMemoryLimitBytes: number
  maxConnections: number
  maxStreamConnections: number
  port: number
  logLevel: LogLevel
  chainId: number
  clients: RpcClients
  authSecret?: string
}

export const DEFAULT_BACKFILL_MEMORY_LIMIT_MB = 64
export const MIN_BACKFILL_MEMORY_LIMIT_MB = 8
export const MAX_BACKFILL_MEMORY_LIMIT_MB = 4_096
export const DEFAULT_API_CONNECTION_RESERVE = 20

const backfillMemoryLimitMbSchema = z.coerce
  .number()
  .int()
  .min(MIN_BACKFILL_MEMORY_LIMIT_MB)
  .max(MAX_BACKFILL_MEMORY_LIMIT_MB)
  .default(DEFAULT_BACKFILL_MEMORY_LIMIT_MB)

const maxConnectionsSchema = z.coerce.number().int().min(1).default(100)
const maxStreamConnectionsSchema = z.coerce.number().int().min(1)

const envSchema = z.object({
  RPC_URL: z.url().optional(),
  REALTIME_RPC_URL: z.url().optional(),
  DATABASE_URL: z.url().optional(),
  MAX_CONNECTIONS: maxConnectionsSchema,
  MAX_STREAM_CONNECTIONS: maxStreamConnectionsSchema,
  START_BLOCK: z.coerce.bigint().default(0n),
  FINALITY: z.coerce.bigint().default(30n),
  PORT: z.coerce.number().int().positive().default(8545),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  MAX_LOGS_BLOCK_RANGE: z.coerce.bigint().default(2_000n),
  DEFER_BACKFILL_INDEXES: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1')
    .default(false),
  BACKFILL_MEMORY_LIMIT_MB: backfillMemoryLimitMbSchema,
  AUTH_SECRET: z.string().min(16).optional(),
})

export type CliConfig = {
  rpcUrl?: string
  realtimeRpcUrl?: string
  databaseUrl?: string
  maxConnections?: number
  maxStreamConnections?: number
  startBlock?: string
  finality?: string
  maxLogsBlockRange?: string
  deferBackfillIndexes?: boolean
  backfillMemoryLimitMb?: number
  port?: number
  logLevel?: LogLevel
  authSecret?: string
}

/**
 * Resolves the retained backfill-data target with CLI-over-environment precedence.
 */
export function resolveBackfillMemoryLimitBytes(
  flagValue: number | undefined,
  envValue: string | undefined
): number {
  return backfillMemoryLimitMbSchema.parse(flagValue ?? envValue) * 1024 * 1024
}

/** Resolves the API PostgreSQL pool size with CLI precedence. */
export function resolveMaxConnections(
  flagValue: number | undefined,
  envValue: string | undefined
): number {
  return maxConnectionsSchema.parse(flagValue ?? envValue)
}

/** Resolves the streamed-request share of the API PostgreSQL pool. */
export function resolveMaxStreamConnections(
  flagValue: number | undefined,
  envValue: string | undefined,
  maxConnections: number
): number {
  const value =
    flagValue ??
    envValue ??
    Math.max(1, maxConnections - DEFAULT_API_CONNECTION_RESERVE)
  const maxStreamConnections = maxStreamConnectionsSchema.parse(value)
  if (maxStreamConnections > maxConnections) {
    throw new Error('MAX_STREAM_CONNECTIONS cannot exceed MAX_CONNECTIONS')
  }
  return maxStreamConnections
}

/**
 * Builds the runtime configuration used by the CLI, sync engine, and API.
 *
 * Values are resolved from flags first and environment variables second. The
 * upstream `chainId` is fetched during configuration so JSON-RPC methods such as
 * `eth_chainId` and `net_version` can be served from memory without a database
 * or upstream call per request.
 */
export async function createConfig(flags: CliConfig): Promise<InternalConfig> {
  const maxConnections = resolveMaxConnections(
    flags.maxConnections,
    process.env.MAX_CONNECTIONS
  )
  const maxStreamConnections = resolveMaxStreamConnections(
    flags.maxStreamConnections,
    process.env.MAX_STREAM_CONNECTIONS,
    maxConnections
  )
  const env = envSchema.parse({
    ...process.env,
    RPC_URL: flags.rpcUrl ?? process.env.RPC_URL,
    REALTIME_RPC_URL: flags.realtimeRpcUrl ?? process.env.REALTIME_RPC_URL,
    DATABASE_URL: flags.databaseUrl ?? process.env.DATABASE_URL,
    MAX_CONNECTIONS: maxConnections,
    MAX_STREAM_CONNECTIONS: maxStreamConnections,
    START_BLOCK: flags.startBlock ?? process.env.START_BLOCK,
    FINALITY: flags.finality ?? process.env.FINALITY,
    PORT: flags.port ?? process.env.PORT,
    LOG_LEVEL: flags.logLevel ?? process.env.LOG_LEVEL,
    MAX_LOGS_BLOCK_RANGE:
      flags.maxLogsBlockRange ?? process.env.MAX_LOGS_BLOCK_RANGE,
    DEFER_BACKFILL_INDEXES:
      flags.deferBackfillIndexes ?? process.env.DEFER_BACKFILL_INDEXES,
    BACKFILL_MEMORY_LIMIT_MB:
      flags.backfillMemoryLimitMb ?? process.env.BACKFILL_MEMORY_LIMIT_MB,
    AUTH_SECRET: flags.authSecret ?? process.env.AUTH_SECRET,
  })

  if (!env.RPC_URL) {
    throw new Error('RPC_URL is required')
  }

  if (!env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required')
  }

  const clients = createRpcClients({
    rpcUrl: env.RPC_URL,
    realtimeRpcUrl: env.REALTIME_RPC_URL,
  })
  const chainId = await clients.backfill.getChainId()

  return {
    databaseUrl: env.DATABASE_URL,
    startBlock: env.START_BLOCK,
    finality: env.FINALITY,
    maxLogsBlockRange: env.MAX_LOGS_BLOCK_RANGE,
    deferBackfillIndexes: env.DEFER_BACKFILL_INDEXES,
    backfillMemoryLimitBytes: env.BACKFILL_MEMORY_LIMIT_MB * 1024 * 1024,
    maxConnections: env.MAX_CONNECTIONS,
    maxStreamConnections: env.MAX_STREAM_CONNECTIONS,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    chainId,
    clients,
    authSecret: env.AUTH_SECRET,
  }
}
