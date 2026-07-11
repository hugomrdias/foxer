import dotenv from 'dotenv'
import { z } from 'zod'

import {
  DEFAULT_COPY_CHUNK_BYTES,
  MAX_COPY_CHUNK_BYTES,
  MIN_COPY_CHUNK_BYTES,
} from './db/copy.ts'
import { createRpcClients, type RpcClients } from './rpc/client.ts'
import type { LogLevel } from './utils/logger.ts'

dotenv.config({
  path: '.env.local',
  quiet: true,
})

export type DatabaseConfig =
  | {
      driver: 'postgres'
      url: string
    }
  | {
      driver: 'pglite'
      directory: string
    }

export type BackfillWriteMode = 'auto' | 'copy' | 'insert'

export type InternalConfig = {
  database?: DatabaseConfig
  startBlock: bigint
  finality: bigint
  batchSize: bigint
  maxLogsBlockRange: bigint
  maxLogsResultRows: number
  deferBackfillIndexes: boolean
  backfillWriteMode: BackfillWriteMode
  backfillFetchConcurrency: number
  backfillCopyChunkBytes: number
  maxConnections: number
  port: number
  logLevel: LogLevel
  chainId: number
  clients: RpcClients
  authSecret?: string
}

const backfillCopyChunkBytesSchema = z.coerce
  .number()
  .int()
  .min(MIN_COPY_CHUNK_BYTES)
  .max(MAX_COPY_CHUNK_BYTES)
  .default(DEFAULT_COPY_CHUNK_BYTES)

const maxConnectionsSchema = z.coerce.number().int().min(3).default(20)

const envSchema = z.object({
  RPC_URL: z.url().optional(),
  REALTIME_RPC_URL: z.url().optional(),
  DATABASE_URL: z.url().optional(),
  MAX_CONNECTIONS: maxConnectionsSchema,
  START_BLOCK: z.coerce.bigint().default(0n),
  FINALITY: z.coerce.bigint().default(30n),
  BATCH_SIZE: z.coerce.bigint().default(100n),
  PORT: z.coerce.number().int().positive().default(8545),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  MAX_LOGS_BLOCK_RANGE: z.coerce.bigint().default(10_000n),
  MAX_LOGS_RESULT_ROWS: z.coerce.number().int().positive().default(10_000),
  DEFER_BACKFILL_INDEXES: z
    .union([z.boolean(), z.string()])
    .optional()
    .transform((value) => value === true || value === 'true' || value === '1')
    .default(false),
  BACKFILL_WRITE_MODE: z.enum(['auto', 'copy', 'insert']).default('auto'),
  BACKFILL_FETCH_CONCURRENCY: z.coerce.number().int().positive().default(20),
  BACKFILL_COPY_CHUNK_BYTES: backfillCopyChunkBytesSchema,
  AUTH_SECRET: z.string().min(16).optional(),
})

export type CliConfig = {
  rpcUrl?: string
  realtimeRpcUrl?: string
  databaseUrl?: string
  maxConnections?: number
  pgliteDir?: string
  startBlock?: string
  finality?: string
  batchSize?: string
  maxLogsBlockRange?: string
  maxLogsResultRows?: number
  deferBackfillIndexes?: boolean
  backfillWriteMode?: BackfillWriteMode
  backfillFetchConcurrency?: number
  backfillCopyChunkBytes?: number
  port?: number
  logLevel?: LogLevel
  authSecret?: string
}

/**
 * Resolves validated COPY chunk bytes with CLI-over-environment precedence.
 */
export function resolveBackfillCopyChunkBytes(
  flagValue: number | undefined,
  envValue: string | undefined
): number {
  return backfillCopyChunkBytesSchema.parse(flagValue ?? envValue)
}

/** Resolves the total PostgreSQL connection budget with CLI precedence. */
export function resolveMaxConnections(
  flagValue: number | undefined,
  envValue: string | undefined
): number {
  return maxConnectionsSchema.parse(flagValue ?? envValue)
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
  const env = envSchema.parse({
    ...process.env,
    RPC_URL: flags.rpcUrl ?? process.env.RPC_URL,
    REALTIME_RPC_URL: flags.realtimeRpcUrl ?? process.env.REALTIME_RPC_URL,
    DATABASE_URL: flags.databaseUrl ?? process.env.DATABASE_URL,
    MAX_CONNECTIONS: resolveMaxConnections(
      flags.maxConnections,
      process.env.MAX_CONNECTIONS
    ),
    START_BLOCK: flags.startBlock ?? process.env.START_BLOCK,
    FINALITY: flags.finality ?? process.env.FINALITY,
    BATCH_SIZE: flags.batchSize ?? process.env.BATCH_SIZE,
    PORT: flags.port ?? process.env.PORT,
    LOG_LEVEL: flags.logLevel ?? process.env.LOG_LEVEL,
    MAX_LOGS_BLOCK_RANGE:
      flags.maxLogsBlockRange ?? process.env.MAX_LOGS_BLOCK_RANGE,
    MAX_LOGS_RESULT_ROWS:
      flags.maxLogsResultRows ?? process.env.MAX_LOGS_RESULT_ROWS,
    DEFER_BACKFILL_INDEXES:
      flags.deferBackfillIndexes ?? process.env.DEFER_BACKFILL_INDEXES,
    BACKFILL_WRITE_MODE:
      flags.backfillWriteMode ?? process.env.BACKFILL_WRITE_MODE,
    BACKFILL_FETCH_CONCURRENCY:
      flags.backfillFetchConcurrency ?? process.env.BACKFILL_FETCH_CONCURRENCY,
    BACKFILL_COPY_CHUNK_BYTES: resolveBackfillCopyChunkBytes(
      flags.backfillCopyChunkBytes,
      process.env.BACKFILL_COPY_CHUNK_BYTES
    ),
    AUTH_SECRET: flags.authSecret ?? process.env.AUTH_SECRET,
  })

  if (!env.RPC_URL) {
    throw new Error('RPC_URL is required')
  }

  const clients = createRpcClients({
    rpcUrl: env.RPC_URL,
    realtimeRpcUrl: env.REALTIME_RPC_URL,
  })
  const chainId = await clients.backfill.getChainId()
  const database = env.DATABASE_URL
    ? ({ driver: 'postgres', url: env.DATABASE_URL } as const)
    : ({
        driver: 'pglite',
        directory: flags.pgliteDir ?? '.pglite',
      } as const)

  return {
    database,
    startBlock: env.START_BLOCK,
    finality: env.FINALITY,
    batchSize: env.BATCH_SIZE,
    maxLogsBlockRange: env.MAX_LOGS_BLOCK_RANGE,
    maxLogsResultRows: env.MAX_LOGS_RESULT_ROWS,
    deferBackfillIndexes: env.DEFER_BACKFILL_INDEXES,
    backfillWriteMode: env.BACKFILL_WRITE_MODE,
    backfillFetchConcurrency: env.BACKFILL_FETCH_CONCURRENCY,
    backfillCopyChunkBytes: env.BACKFILL_COPY_CHUNK_BYTES,
    maxConnections: env.MAX_CONNECTIONS,
    port: env.PORT,
    logLevel: env.LOG_LEVEL,
    chainId,
    clients,
    authSecret: env.AUTH_SECRET,
  }
}

/**
 * Resolves the effective backfill writer for the configured database driver.
 *
 * `auto` selects COPY on PostgreSQL and inserts on PGlite. Explicit `copy` on
 * PGlite fails with a clear configuration error.
 */
export function resolveBackfillWriteMode(
  mode: BackfillWriteMode,
  driver: DatabaseConfig['driver']
): 'copy' | 'insert' {
  if (mode === 'insert') {
    return 'insert'
  }

  if (mode === 'copy') {
    if (driver === 'pglite') {
      throw new Error(
        'BACKFILL_WRITE_MODE=copy requires PostgreSQL; use auto or insert for PGlite'
      )
    }
    return 'copy'
  }

  return driver === 'postgres' ? 'copy' : 'insert'
}
