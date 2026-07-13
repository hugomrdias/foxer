import { afterAll, afterEach, beforeAll, setDefaultTimeout } from 'bun:test'
import { PostgreSqlContainer } from '@testcontainers/postgresql'
import { Wait } from 'testcontainers'
import { migrateTemplateDatabase, setPostgresContainer } from './postgres.ts'
import { server } from './upstream.ts'

let container: Awaited<ReturnType<PostgreSqlContainer['start']>> | undefined

setDefaultTimeout(120_000)

beforeAll(async () => {
  server.listen({ onUnhandledRequest: 'error' })
  container = await new PostgreSqlContainer('postgres:17-alpine')
    .withDatabase('foxer_template')
    .withUsername('foxer')
    .withPassword('foxer')
    .withWaitStrategy(
      Wait.forLogMessage(/database system is ready to accept connections/, 2)
    )
    .start()
  setPostgresContainer(container, container.getConnectionUri())
  await migrateTemplateDatabase()
})

afterEach(() => server.resetHandlers())

afterAll(async () => {
  server.close()
  await container?.stop()
})
