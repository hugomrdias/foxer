import dotenv from 'dotenv'
import { z } from 'zod'
import type { Logger } from '../utils/logger'

dotenv.config({
  path: '.env.local',
})

export type Env = z.infer<typeof envSchema>
const envSchema = z.object({
  PGLITE_DATA_DIR: z.string().default('.pglite'),
  DATABASE_URL: z.url().optional(),
  RPC_URL: z.url().default('https://foc-dev.up.railway.app/ponder/evm/314159'),
  CONFIRMATION_DEPTH: z.coerce.number().int().nonnegative().default(30),
  BATCH_SIZE: z.coerce.number().int().positive().default(100),
  PORT: z.coerce.number().int().positive().default(4200),
  LOG_LEVEL: z
    .enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal'])
    .default('info'),
  LOG_MODE: z.enum(['pretty', 'json']).default('pretty'),
})

export function createEnv(logger: Logger) {
  const parsed = envSchema.safeParse(process.env)

  if (!parsed.success) {
    throw new Error(
      `Failed to parse environment variables: \n ${z.flattenError(parsed.error)}`
    )
  }
  logger.debug({ env: parsed.data }, 'env parsed')
  return parsed.data
}
