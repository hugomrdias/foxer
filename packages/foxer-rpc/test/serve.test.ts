import { expect, mock, test } from 'bun:test'
import { type ApiServerDependencies, runApiServer } from '../src/bin/serve.ts'
import type { InternalConfig } from '../src/config.ts'
import type { Database, DatabaseContext } from '../src/db/client.ts'
import type { Logger } from '../src/utils/logger.ts'

const logger = {} as Logger
const config = {
  database: {
    driver: 'postgres',
    url: 'postgres://localhost/foxer_rpc',
  },
  maxConnections: 17,
  port: 8545,
} as InternalConfig

function createDependencies(options: {
  apiStop?: () => Promise<void>
  createApi?: () => { stop: () => Promise<void> }
  dbStop: () => Promise<void>
  onCreateDatabase?: (options: {
    role?: string
    maxConnections?: number
  }) => void
  onCreateExit?: (stop: () => Promise<void>) => void
}): ApiServerDependencies {
  return {
    createConfig: mock(async () => config),
    createDatabase: mock((databaseOptions) => {
      options.onCreateDatabase?.(databaseOptions)
      return {
        db: {} as Database,
        driver: 'postgres',
        stop: options.dbStop,
      } satisfies DatabaseContext
    }),
    createApi: mock(
      options.createApi ?? (() => ({ stop: options.apiStop ?? mock() }))
    ),
    createExit: mock(({ stop }) => {
      options.onCreateExit?.(stop)
    }),
  }
}

test('starts only the API pool and registers ordered shutdown', async () => {
  const calls: string[] = []
  let shutdown: (() => Promise<void>) | undefined
  let databaseOptions: { role?: string; maxConnections?: number } | undefined
  const dependencies = createDependencies({
    apiStop: () => {
      calls.push('api.stop')
      return Promise.resolve()
    },
    dbStop: () => {
      calls.push('database.stop')
      return Promise.resolve()
    },
    onCreateDatabase: (options) => {
      calls.push('database.create')
      databaseOptions = options
    },
    onCreateExit: (stop) => {
      calls.push('shutdown.register')
      shutdown = stop
    },
  })

  await runApiServer({ logger, flags: {} }, dependencies)

  expect(databaseOptions).toMatchObject({
    role: 'api',
    maxConnections: 17,
  })
  expect(calls).toEqual(['database.create', 'shutdown.register'])
  expect(shutdown).toBeDefined()

  await shutdown?.()
  expect(calls).toEqual([
    'database.create',
    'shutdown.register',
    'api.stop',
    'database.stop',
  ])
})

test('closes the database when API startup fails', async () => {
  const startupError = new Error('API startup failed')
  const dbStop = mock(() => Promise.resolve())
  const dependencies = createDependencies({
    createApi: () => {
      throw startupError
    },
    dbStop,
  })

  await expect(runApiServer({ logger, flags: {} }, dependencies)).rejects.toBe(
    startupError
  )
  expect(dbStop).toHaveBeenCalledTimes(1)
  expect(dependencies.createExit).not.toHaveBeenCalled()
})

test('reports startup and database cleanup failures together', async () => {
  const startupError = new Error('API startup failed')
  const cleanupError = new Error('database cleanup failed')
  const dependencies = createDependencies({
    createApi: () => {
      throw startupError
    },
    dbStop: () => Promise.reject(cleanupError),
  })

  try {
    await runApiServer({ logger, flags: {} }, dependencies)
    throw new Error('expected startup to fail')
  } catch (error) {
    expect(error).toBeInstanceOf(AggregateError)
    expect((error as AggregateError).errors).toEqual([
      startupError,
      expect.any(AggregateError),
    ])
  }
})

test('continues database shutdown when API shutdown fails', async () => {
  const apiError = new Error('API shutdown failed')
  const calls: string[] = []
  let shutdown: (() => Promise<void>) | undefined
  const dependencies = createDependencies({
    apiStop: () => {
      calls.push('api.stop')
      return Promise.reject(apiError)
    },
    dbStop: () => {
      calls.push('database.stop')
      return Promise.resolve()
    },
    onCreateExit: (stop) => {
      shutdown = stop
    },
  })

  await runApiServer({ logger, flags: {} }, dependencies)

  await expect(shutdown?.()).rejects.toEqual(
    new AggregateError([apiError], 'shutdown failed')
  )
  expect(calls).toEqual(['api.stop', 'database.stop'])
})
