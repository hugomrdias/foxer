import { asyncExitHook, gracefulExit } from 'exit-hook'
import type { Logger } from 'pino'

export function createExit({
  logger,
  stop,
}: {
  logger: Logger
  stop: () => Promise<void>
}) {
  asyncExitHook(
    async () => {
      logger.warn('shutting down...')
      await stop()
      logger.info('shutdown complete')
      process.exit(0)
    },
    {
      wait: 300,
    }
  )

  // process.on('uncaughtException', (error, origin) => {
  //   logger.error({ err: error }, 'uncaught exception')
  //   gracefulExit(1)
  // })

  // process.on('unhandledRejection', (error) => {
  //   logger.error({ err: error }, 'unhandled rejection')
  //   gracefulExit(1)
  // })
}

export function registerUnhandled({ logger }: { logger: Logger }) {
  process.on('uncaughtException', (error, origin) => {
    if (!origin || origin === 'uncaughtException') {
      logger.error({ err: error }, 'uncaught exception')
      gracefulExit(1)
    }
  })

  process.on('unhandledRejection', (error) => {
    logger.error({ err: error }, 'unhandled rejection')
    gracefulExit(1)
  })
}
