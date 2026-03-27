import pc from 'picocolors'
import type { DestinationStream, LevelWithSilent } from 'pino'
import pino from 'pino'
import type { Simplify } from 'type-fest'
import { stringify } from 'viem'

import { formatLogDuration } from './format.ts'

export type LogMode = 'pretty' | 'json'
export type LogLevel = Simplify<LevelWithSilent>
export type Logger = ReturnType<typeof createLogger>

export function createLogger({
  level,
  mode,
}: {
  level: LogLevel
  mode: LogMode
}) {
  const stream: DestinationStream = {
    write(logString: string) {
      const log = JSON.parse(logString) as Log
      const prettyLog = format(log)
      // biome-ignore lint/suspicious/noConsole: logging to console
      console.log(prettyLog)
    },
  }
  const errorSerializer = pino.stdSerializers.wrapErrorSerializer((error) => {
    const extra: Record<string, unknown> = {}
    const meta = Array.isArray(error.meta) ? error.meta.join('\n') : error.meta
    if (meta) {
      extra.meta = meta
    }
    if (error.raw.cause) {
      extra.cause = error.raw.cause
    }
    return {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name,
      ...extra,
    }
  })
  let logger: pino.Logger

  if (mode === 'pretty') {
    logger = pino(
      {
        level,
        serializers: {
          error: errorSerializer,
        },
        // Removes "pid" and "hostname" properties from the log.
        base: undefined,
      },
      stream
    )
  } else {
    logger = pino({
      level,
      serializers: {
        error: errorSerializer,
      },
      // Removes "pid" and "hostname" properties from the log.
      base: undefined,
    })
  }
  return logger
}

type Log = {
  // Pino properties
  level: 50 | 40 | 30 | 20 | 10
  time: number

  msg: string

  duration?: number
  error?: Error
} & Record<string, unknown>

const INTERNAL_KEYS = ['level', 'time', 'msg', 'duration', 'error']

const levels = {
  50: { label: 'ERROR', colorLabel: pc.red('ERROR') },
  40: { label: 'WARN ', colorLabel: pc.yellow('WARN ') },
  30: { label: 'INFO ', colorLabel: pc.green('INFO ') },
  20: { label: 'DEBUG', colorLabel: pc.blue('DEBUG') },
  10: { label: 'TRACE', colorLabel: pc.gray('TRACE') },
} as const

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  fractionalSecondDigits: 3,
  hour12: false,
})

const format = (log: Log) => {
  const time = timeFormatter.format(new Date(log.time))
  const levelObject = levels[log.level ?? 30]

  let prettyLog: string[]
  if (pc.isColorSupported) {
    const level = levelObject.colorLabel
    const messageText = pc.reset(log.msg)

    let keyText = ''

    for (const key of Object.keys(log)) {
      if (INTERNAL_KEYS.includes(key)) continue
      const value =
        typeof log[key] === 'string' ? log[key] : stringify(log[key])
      keyText += ` ${key}=${value}`
    }

    let durationText = ''
    if (log.duration) {
      durationText = ` ${pc.gray(`(${formatLogDuration(log.duration)})`)}`
    }

    prettyLog = [
      `${pc.dim(time)} ${level} ${messageText}${pc.dim(keyText)}${durationText}`,
    ]
  } else {
    const level = levelObject.label

    let keyText = ''
    for (const key of Object.keys(log)) {
      if (INTERNAL_KEYS.includes(key)) continue
      const value =
        typeof log[key] === 'string' ? log[key] : stringify(log[key])
      keyText += ` ${key}=${value}`
    }

    let durationText = ''
    if (log.duration) {
      durationText = ` (${formatLogDuration(log.duration)})`
    }

    prettyLog = [`${time} ${level} ${log.msg}${keyText}${durationText}`]
  }

  if (log.error) {
    if (log.error.stack) {
      prettyLog.push(log.error.stack)
    } else {
      prettyLog.push(`${log.error.name}: ${log.error.message}`)
    }

    if (typeof log.error === 'object' && 'where' in log.error) {
      prettyLog.push(`where: ${log.error.where as string}`)
    }
    if (typeof log.error === 'object' && 'meta' in log.error) {
      prettyLog.push(log.error.meta as string)
    }
  }
  return prettyLog.join('\n')
}
