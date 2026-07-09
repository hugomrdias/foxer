import type { Hex } from 'viem'

import type { schema } from '../db/schema/index.ts'
import { createLogsBloom, zeroLogsBloom } from '../utils/bloom.ts'

type BlockRow = typeof schema.blocks.$inferSelect
type TransactionRow = typeof schema.transactions.$inferSelect
type LogRow = typeof schema.logs.$inferSelect

/**
 * Formats integer-like values as Ethereum JSON-RPC hex quantities.
 *
 * `null` is preserved for optional fields so callers can distinguish "missing"
 * from a real zero value.
 */
export function quantity(
  value: bigint | number | null | undefined
): Hex | null {
  if (value == null) return null
  return `0x${BigInt(value).toString(16)}` as Hex
}

/**
 * Reconstructs an Ethereum block response from compact database rows.
 *
 * Several Filecoin/FEVM Ethereum-view fields are deterministic constants, so
 * they are emitted here instead of stored. `logsBloom` is recomputed from the
 * block's logs to keep the blocks table small.
 */
export function decodeBlock(
  block: BlockRow,
  transactions: TransactionRow[],
  logs: LogRow[],
  fullTransactions: boolean,
  chainId: number
) {
  return {
    number: quantity(block.number),
    hash: block.hash,
    parentHash: block.parentHash,
    nonce: '0x0000000000000000',
    sha3Uncles:
      '0x1dcc4de8dec75d7aab85b567b6ccd41ad312451b948a7413f0a142fd40d49347',
    logsBloom: logsBloom(logs),
    transactionsRoot: block.transactionsRoot,
    stateRoot: block.stateRoot,
    receiptsRoot: block.receiptsRoot,
    miner: block.miner,
    difficulty: '0x0',
    totalDifficulty: '0x0',
    extraData: block.extraData,
    size: quantity(block.size),
    gasLimit: quantity(block.gasLimit),
    gasUsed: quantity(block.gasUsed),
    timestamp: quantity(block.timestamp),
    transactions: fullTransactions
      ? transactions.map((tx) => decodeTransaction(tx, chainId, block))
      : transactions.map((tx) => tx.hash),
    uncles: [],
    baseFeePerGas: quantity(block.baseFeePerGas),
    mixHash:
      '0x0000000000000000000000000000000000000000000000000000000000000000',
  }
}

/**
 * Reconstructs an Ethereum transaction object from a transaction row.
 *
 * If a block row is provided, block hash and block number are included. This
 * supports both mined transaction responses and any future pending-style shapes.
 */
export function decodeTransaction(
  tx: TransactionRow,
  chainId: number,
  block?: BlockRow
) {
  return {
    hash: tx.hash,
    nonce: quantity(tx.nonce),
    blockHash: block?.hash ?? null,
    blockNumber: block ? quantity(tx.blockNumber) : null,
    transactionIndex: quantity(tx.transactionIndex),
    from: tx.from,
    to: tx.to,
    value: quantity(tx.value),
    gas: quantity(tx.gas),
    gasPrice: quantity(tx.gasPrice ?? tx.effectiveGasPrice),
    input: tx.input,
    type: quantity(tx.type),
    maxFeePerGas: quantity(tx.maxFeePerGas),
    maxPriorityFeePerGas: quantity(tx.maxPriorityFeePerGas),
    accessList: tx.accessList ?? [],
    chainId: quantity(chainId),
    v: quantity(tx.v),
    r: tx.r,
    s: tx.s,
  }
}

/**
 * Reconstructs an Ethereum transaction receipt from a transaction row and logs.
 *
 * Receipt fields are stored on `transactions`, while log objects are joined by
 * `(blockNumber, transactionIndex)` and decoded with their block/transaction
 * hashes restored.
 */
export function decodeReceipt(
  tx: TransactionRow,
  block: BlockRow,
  logs: LogRow[]
) {
  return {
    transactionHash: tx.hash,
    transactionIndex: quantity(tx.transactionIndex),
    blockHash: block.hash,
    blockNumber: quantity(tx.blockNumber),
    from: tx.from,
    to: tx.to,
    cumulativeGasUsed: quantity(tx.cumulativeGasUsed),
    gasUsed: quantity(tx.receiptGasUsed),
    contractAddress: tx.contractAddress,
    logs: logs.map((log) => decodeLog(log, block, tx)),
    logsBloom: logsBloom(logs),
    status: quantity(tx.status),
    type: quantity(tx.type),
    effectiveGasPrice: quantity(tx.effectiveGasPrice),
  }
}

/**
 * Reconstructs one Ethereum log object from the compact log row.
 *
 * The log table omits `blockHash` and `transactionHash`; this function restores
 * them from the joined block and transaction rows.
 */
export function decodeLog(log: LogRow, block: BlockRow, tx: TransactionRow) {
  return {
    address: log.address,
    topics: [log.topic0, log.topic1, log.topic2, log.topic3].filter(Boolean),
    data: log.data,
    blockNumber: quantity(log.blockNumber),
    transactionHash: tx.hash,
    transactionIndex: quantity(log.transactionIndex),
    blockHash: block.hash,
    logIndex: quantity(log.logIndex),
    removed: false,
  }
}

/**
 * Builds a receipt/block logs bloom from log addresses and topics on demand.
 */
function logsBloom(logs: LogRow[]) {
  if (logs.length === 0) return zeroLogsBloom
  const values = logs.flatMap((log) =>
    [log.address, log.topic0, log.topic1, log.topic2, log.topic3].filter(
      Boolean
    )
  ) as Hex[]
  return createLogsBloom(values)
}
