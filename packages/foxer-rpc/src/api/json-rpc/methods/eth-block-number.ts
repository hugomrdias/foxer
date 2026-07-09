import type { Database } from '../../../db/client.ts'
import { quantity } from '../../decode.ts'

/**
 * Returns the latest locally indexed block number.
 */
export async function ethBlockNumber(db: Database) {
  const latest = (await db.$prepared.getLatestBlock.execute())[0]?.number
  return latest == null ? quantity(0) : quantity(latest)
}
