import { asyncExitHook, gracefulExit } from 'exit-hook'
import type { Logger } from 'pino'

export function createExit({
  logger,
  stop,
}: {
  logger: Logger
  stop: () => Promise<void>
}) {
  registerUnhandled({ logger })
  asyncExitHook(
    async () => {
      logger.warn('shutting down...')
      await stop()
      logger.info('shutdown complete')
      // process.exit(0)
    },
    {
      wait: 1000,
    }
  )
}

export function registerUnhandled({ logger }: { logger: Logger }) {
  process.on('uncaughtException', (error, origin) => {
    if (!origin || origin === 'uncaughtException') {
      logger.error({ error }, 'uncaught exception')
      gracefulExit(1)
    }
  })

  process.on('unhandledRejection', (error) => {
    logger.error({ error }, 'unhandled rejection')
    gracefulExit(1)
  })
}
