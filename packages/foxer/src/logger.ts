import dotenv from 'dotenv'
import pino from 'pino'

dotenv.config({
  path: '.env.local',
})

const isDev = process.env.NODE_ENV !== 'production'
const level = process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info')

/**
 * Shared structured logger for the application.
 * In development, output is piped through pino-pretty for readability.
 */
export const logger = pino({
  level,
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
        },
      }
    : undefined,
})

/**
 * Creates a child logger scoped to a component.
 */
export function createComponentLogger(component: string) {
  return logger.child({ component })
}
