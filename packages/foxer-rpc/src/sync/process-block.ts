import type { PublicClient } from 'viem'

import { insertIndexedBlockData } from '../db/actions.ts'
import type { Database } from '../db/client.ts'
import type { IndexedBlockData } from '../types.ts'
import type { Logger } from '../utils/logger.ts'
import { ensureParentContinuity } from './reorg.ts'

export type ProcessBlockResult =
  | { status: 'ok' }
  | { status: 'reorg'; rewindTo: bigint }

/**
 * Writes an indexed block payload to the database.
 *
 * Live blocks first pass through parent-hash continuity checks so reorgs can be
 * rewound before new rows are persisted.
 */
export async function processBlock(args: {
  logger: Logger
  db: Database
  client: PublicClient
  data: IndexedBlockData
}): Promise<ProcessBlockResult> {
  const { db, client, data, logger } = args

  const rewindTo = await ensureParentContinuity({
    logger,
    db,
    client,
    block: data.block,
  })
  if (rewindTo != null) {
    return { status: 'reorg', rewindTo }
  }

  await insertIndexedBlockData({
    db,
    batch: [data],
  })

  return { status: 'ok' }
}
