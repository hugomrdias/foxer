import type { StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { Pool } from 'pg'

import { createDatabase, type DatabaseContext } from '../src/db/client.ts'
import { runMigrations } from '../src/db/migrate.ts'
import { testLogger } from './test-logger.ts'

export type TestDatabaseContext = DatabaseContext & {
  databaseUrl: string
}

type TestState = {
  container?: StartedPostgreSqlContainer
  templateUrl?: string
  nextDatabase: number
}

const state: TestState = { nextDatabase: 0 }

export function setPostgresContainer(
  container: StartedPostgreSqlContainer,
  templateUrl: string
) {
  state.container = container
  state.templateUrl = templateUrl
}

export async function migrateTemplateDatabase() {
  if (!state.templateUrl)
    throw new Error('PostgreSQL test container is not ready')
  const dbContext = createDatabase({
    databaseUrl: state.templateUrl,
    logger: testLogger,
  })
  try {
    await runMigrations({
      dbContext,
      folder: new URL('../drizzle', import.meta.url).pathname,
      logger: testLogger,
    })
  } finally {
    await dbContext.stop()
  }
}

export async function createTestDatabaseContext(): Promise<TestDatabaseContext> {
  const container = state.container
  if (!container) throw new Error('PostgreSQL test container is not ready')

  const database = `foxer_test_${process.pid}_${state.nextDatabase++}`
  const admin = new Pool({ connectionString: systemDatabaseUrl(container) })
  try {
    await admin.query(`CREATE DATABASE "${database}" TEMPLATE "foxer_template"`)
  } finally {
    await admin.end()
  }

  const connectionString = databaseUrl(container, database)
  const context = createDatabase({
    databaseUrl: connectionString,
    logger: testLogger,
  })
  const stop = context.stop
  return {
    ...context,
    databaseUrl: connectionString,
    stop: async () => {
      await stop()
      const cleanup = new Pool({
        connectionString: systemDatabaseUrl(container),
      })
      try {
        await cleanup.query(
          `DROP DATABASE IF EXISTS "${database}" WITH (FORCE)`
        )
      } finally {
        await cleanup.end()
      }
    },
  }
}

function systemDatabaseUrl(container: StartedPostgreSqlContainer) {
  return databaseUrl(container, 'postgres')
}

function databaseUrl(container: StartedPostgreSqlContainer, database: string) {
  const url = new URL(container.getConnectionUri())
  url.pathname = `/${database}`
  return url.toString()
}
