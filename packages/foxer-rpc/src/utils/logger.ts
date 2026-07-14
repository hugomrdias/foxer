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
      // biome-ignore lint/suspicious/noConsole: logging to console
      console.log(format(log))
    },
  }
  const errorSerializer = pino.stdSerializers.wrapErrorSerializer((error) => {
    const extra: Record<string, unknown> = {}
    const meta = Array.isArray(error.meta) ? error.meta.join('\n') : error.meta
    if (meta) extra.meta = meta
    if (error.raw.cause instanceof Error) {
      extra.cause = pino.stdSerializers.err(error.raw.cause)
    } else if (error.raw.cause) {
      extra.cause = error.raw.cause
    }
    return {
      message: error.message,
      stack: error.stack,
      type: error.constructor.name,
      ...extra,
    }
  })

  if (mode === 'pretty') {
    return pino(
      {
        level,
        serializers: { error: errorSerializer },
        base: undefined,
      },
      stream
    )
  }

  return pino({
    level,
    serializers: { error: errorSerializer },
    formatters: {
      level: (label) => {
        return {
          level: label,
        }
      },
    },
    base: undefined,
  })
}

type Log = {
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

  const level = pc.isColorSupported ? levelObject.colorLabel : levelObject.label
  const messageText = pc.isColorSupported ? pc.reset(log.msg) : log.msg
  let keyText = ''

  for (const key of Object.keys(log)) {
    if (INTERNAL_KEYS.includes(key)) continue
    const value = typeof log[key] === 'string' ? log[key] : stringify(log[key])
    keyText += ` ${key}=${value}`
  }

  const durationText = log.duration
    ? ` ${pc.gray(`(${formatLogDuration(log.duration)})`)}`
    : ''

  const prettyLog = [
    `${pc.dim(time)} ${level} ${messageText}${pc.dim(keyText)}${durationText}`,
  ]

  if (log.error) {
    prettyLog.push(log.error.stack ?? `${log.error.name}: ${log.error.message}`)
    if (typeof log.error === 'object' && 'where' in log.error) {
      prettyLog.push(`where: ${log.error.where as string}`)
    }
    if (typeof log.error === 'object' && 'meta' in log.error) {
      prettyLog.push(log.error.meta as string)
    }
  }
  return prettyLog.join('\n')
}
