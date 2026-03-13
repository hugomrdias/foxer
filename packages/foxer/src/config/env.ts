import dotenv from 'dotenv'
import { z } from 'zod'
import type { Logger } from '../utils/logger'

dotenv.config({
  path: '.env.local',
  quiet: true,
})

export type Env = z.infer<typeof envSchema>
const envSchema = z.object({
  DATABASE_URL: z.url().optional(),
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
