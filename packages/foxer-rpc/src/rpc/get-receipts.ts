import type { PublicClient } from 'viem'

import { encodeBlockDataFromRpcReceipts } from '../db/encode.ts'
import type { ChainBlock, IndexedBlockData } from '../types.ts'

/**
 * Fetches and immediately encodes all receipts for a block.
 *
 * The raw viem receipt graph stays local to this ingestion boundary. The
 * canonical encoder validates and retains normalized receipt values exactly
 * once while producing final database rows.
 */
export async function getEncodedBlockReceipts(options: {
  client: PublicClient
  block: ChainBlock
}): Promise<IndexedBlockData> {
  const receipts = await options.client.getBlockReceipts({
    blockNumber: options.block.number,
  })
  return encodeBlockDataFromRpcReceipts(options.block, receipts)
}
