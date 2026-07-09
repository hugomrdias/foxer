import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { createDatabase, type Database } from '../src/db/client.ts'
import { runMigrations } from '../src/db/migrate.ts'

export const testLogger = {
  error: () => undefined,
  info: () => undefined,
  warn: () => undefined,
} as never

export async function withTestDatabase<T>(
  run: (db: Database) => Promise<T>
): Promise<T> {
  const directory = await mkdtemp(resolve(tmpdir(), 'foxer-rpc-test-'))
  const dbContext = createDatabase({
    config: { driver: 'pglite', directory },
    logger: testLogger,
  })

  try {
    await runMigrations({
      dbContext,
      folder: resolve(import.meta.dir, '../drizzle'),
      logger: testLogger,
    })
    return await run(dbContext.db)
  } finally {
    await dbContext.stop()
    await rm(directory, { recursive: true, force: true })
  }
}

export const emptyRoot =
  '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'

export function bytes32(byte: string) {
  return `0x${byte.repeat(64)}` as const
}

export function address(byte: string) {
  return `0x${byte.repeat(40)}` as const
}
