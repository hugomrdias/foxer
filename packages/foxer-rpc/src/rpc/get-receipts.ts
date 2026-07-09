import type { PublicClient, TransactionReceipt } from 'viem'

import type { ChainLog, ChainReceipt } from '../types.ts'
import { normalizeHex } from '../utils/hex.ts'

/**
 * Fetches all receipts for a block with viem's `eth_getBlockReceipts` action.
 *
 * Viem formats receipt quantities into bigint/number values for us; this module
 * only normalizes hex casing and fills the optional fields our encoder expects.
 */
export async function getBlockReceipts(options: {
  client: PublicClient
  blockNumber: bigint
}): Promise<ChainReceipt[]> {
  const receipts = await options.client.getBlockReceipts({
    blockNumber: options.blockNumber,
  })
  return receipts.map(normalizeReceipt)
}

/**
 * Normalizes viem receipt fields into the compact internal shape used by encode.
 */
function normalizeReceipt(receipt: TransactionReceipt): ChainReceipt {
  return {
    transactionHash: normalizeHex(receipt.transactionHash),
    transactionIndex: receipt.transactionIndex,
    blockHash: normalizeHex(receipt.blockHash),
    blockNumber: receipt.blockNumber,
    from: normalizeHex(receipt.from),
    to: receipt.to ? normalizeHex(receipt.to) : null,
    cumulativeGasUsed: receipt.cumulativeGasUsed,
    gasUsed: receipt.gasUsed,
    contractAddress: receipt.contractAddress
      ? normalizeHex(receipt.contractAddress)
      : null,
    logs: receipt.logs.map(normalizeLog),
    status: receipt.status,
    effectiveGasPrice: receipt.effectiveGasPrice,
    type: receipt.type,
  }
}

/**
 * Normalizes one viem log into the non-removed internal log shape.
 */
function normalizeLog(log: TransactionReceipt['logs'][number]): ChainLog {
  return {
    address: normalizeHex(log.address),
    topics: log.topics.map(normalizeHex),
    data: normalizeHex(log.data),
    blockNumber: log.blockNumber,
    transactionHash: normalizeHex(log.transactionHash),
    transactionIndex: log.transactionIndex,
    blockHash: normalizeHex(log.blockHash),
    logIndex: log.logIndex,
    removed: Boolean(log.removed),
  }
}
