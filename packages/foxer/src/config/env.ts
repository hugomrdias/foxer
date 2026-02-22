import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

import { createComponentLogger } from '../logger.ts'

loadEnv({
  quiet: true,
})
const log = createComponentLogger('env')

const envSchema = z.object({
  DB_DRIVER: z.enum(['pglite', 'postgres']).default('pglite'),
  PGLITE_DATA_DIR: z.string().default('.pglite'),
  DATABASE_URL: z.url().optional(),
  RPC_URL: z.url().default('https://foc-dev.up.railway.app/ponder/evm/314159'),
  CHAIN_ID: z.coerce.number().int().positive().default(314159),
  CONFIRMATION_DEPTH: z.coerce.number().int().nonnegative().default(30),
  BATCH_SIZE: z.coerce.number().int().positive().default(1000),
  BACKFILL_DB_BATCH_SIZE: z.coerce.number().int().positive().default(250),
  RPC_BATCH_SIZE: z.coerce.number().int().positive().default(100),
  RPC_BATCH_WAIT_MS: z.coerce.number().int().nonnegative().default(16),
  START_BLOCK: z.coerce.bigint().default(0n),
  API_PORT: z.coerce.number().int().positive().default(4200),
  REORG_CHECK_DEPTH: z.coerce.number().int().positive().default(10),
})

const parsed = envSchema.safeParse(process.env)

// biome-ignore lint/suspicious/noConsole: debug
console.log('🚀 ~ parsed:', parsed)

if (!parsed.success) {
  log.error(
    { errors: parsed.error.flatten().fieldErrors },
    'invalid environment configuration'
  )
  throw new Error('Failed to parse environment variables')
}

if (parsed.data.DB_DRIVER === 'postgres' && !parsed.data.DATABASE_URL) {
  throw new Error('DATABASE_URL is required when DB_DRIVER=postgres')
}

export const env = parsed.data
