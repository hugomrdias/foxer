import type { Database } from '../src/db/client.ts'
import { createTestDatabaseContext } from './postgres.ts'

export { zeroLogsBloom } from '../src/utils/bloom.ts'
export { handleTestJsonRpcFailure, testLogger } from './test-logger.ts'

export async function withTestDatabase<T>(
  run: (db: Database) => Promise<T>
): Promise<T> {
  const dbContext = await createTestDatabaseContext()

  try {
    return await run(dbContext.db)
  } finally {
    await dbContext.stop()
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
