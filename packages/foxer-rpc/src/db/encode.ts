import type { Hash, Hex, TransactionReceipt } from 'viem'

import type {
  ChainBlock,
  ChainTransaction,
  EncodedBlock,
  EncodedLog,
  EncodedTransaction,
  IndexedBlockData,
} from '../types.ts'
import { zeroLogsBloom } from '../utils/bloom.ts'
import { normalizeFixedWidthHex, normalizeHex } from '../utils/hex.ts'

/**
 * Converts a viem block into the compact `blocks` insert shape.
 *
 * The encoder stores only fields needed to reconstruct the supported JSON-RPC
 * responses. Hash-like values are normalized before insertion because they are
 * stored as binary `bytea` values by the custom column type.
 */
export function encodeBlock(block: ChainBlock): EncodedBlock {
  if (!block.hash) {
    throw new Error(`Block ${block.number} has no hash`)
  }
  if (!block.logsBloom) {
    throw new Error(`Block ${block.number} has no logs bloom`)
  }

  return {
    number: block.number,
    hash: normalizeHex(block.hash),
    isNullRound: false,
    parentHash: normalizeHex(block.parentHash),
    timestamp: block.timestamp,
    miner: normalizeHex(block.miner),
    gasUsed: block.gasUsed,
    gasLimit: block.gasLimit,
    baseFeePerGas: block.baseFeePerGas ?? null,
    size: block.size ?? 0n,
    stateRoot: normalizeHex(block.stateRoot),
    receiptsRoot: normalizeHex(block.receiptsRoot),
    transactionsRoot: normalizeHex(block.transactionsRoot),
    extraData: normalizeHex(block.extraData),
    logsBloom: normalizeFixedWidthHex(
      block.logsBloom,
      256,
      `Block ${block.number} logs bloom`
    ),
  }
}

/**
 * Converts a viem transaction and its required receipt into one DB row.
 *
 * Receipt fields are merged into `transactions` to avoid a separate receipts
 * table. Receipt hex values are validated and normalized here so persisted rows
 * are the canonical ingestion boundary consumed unchanged by API reads.
 */
export function encodeTransaction(
  tx: ChainTransaction,
  receipt: TransactionReceipt
): EncodedTransaction {
  if (tx.blockNumber == null || tx.transactionIndex == null) {
    throw new Error(`Transaction ${tx.hash} is missing block position`)
  }

  return {
    hash: normalizeHex(tx.hash),
    blockNumber: tx.blockNumber,
    transactionIndex: tx.transactionIndex,
    from: normalizeHex(tx.from),
    to: tx.to ? normalizeHex(tx.to) : null,
    input: normalizeHex(tx.input),
    value: tx.value,
    nonce: tx.nonce,
    gas: tx.gas,
    gasPrice: tx.gasPrice ?? null,
    maxFeePerGas: tx.maxFeePerGas ?? null,
    maxPriorityFeePerGas: tx.maxPriorityFeePerGas ?? null,
    type: encodeTransactionType(tx.type),
    v: tx.v ?? null,
    r: tx.r == null ? null : normalizeSignatureComponent(tx.r, 'r', tx.hash),
    s: tx.s == null ? null : normalizeSignatureComponent(tx.s, 's', tx.hash),
    accessList: tx.accessList ?? null,
    status: receipt.status === 'success' ? 1 : 0,
    receiptGasUsed: receipt.gasUsed,
    cumulativeGasUsed: receipt.cumulativeGasUsed,
    effectiveGasPrice: receipt.effectiveGasPrice,
    contractAddress: receipt.contractAddress
      ? normalizeHex(receipt.contractAddress)
      : null,
    logsBloom: normalizeFixedWidthHex(
      receipt.logsBloom,
      256,
      `Receipt ${receipt.transactionHash} logs bloom`
    ),
  }
}

/**
 * Maps viem's semantic transaction type names, or raw hex values from unknown
 * transaction types, into the numeric JSON-RPC transaction type.
 */
export function encodeTransactionType(type: ChainTransaction['type'] | Hex) {
  switch (type) {
    case 'legacy':
      return 0
    case 'eip2930':
      return 1
    case 'eip1559':
      return 2
    case 'eip4844':
      return 3
    case 'eip7702':
      return 4
    default:
      if (/^0x[0-9a-fA-F]+$/.test(type)) {
        const value = Number.parseInt(type, 16)
        if (Number.isSafeInteger(value) && value <= 32_767) return value
      }
      throw new Error(`Unsupported transaction type: ${type}`)
  }
}

/**
 * Converts receipt logs into compact log rows.
 *
 * The row keeps positional identifiers (`blockNumber`, `transactionIndex`,
 * `logIndex`) plus address/topics/data. `blockHash` and `transactionHash` are
 * recovered by joins at API time to keep the high-cardinality log table smaller.
 */
function encodeLog(log: TransactionReceipt['logs'][number]): EncodedLog {
  return {
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    transactionIndex: log.transactionIndex,
    address: normalizeHex(log.address),
    topic0: normalizeTopic(log.topics[0]),
    topic1: normalizeTopic(log.topics[1]),
    topic2: normalizeTopic(log.topics[2]),
    topic3: normalizeTopic(log.topics[3]),
    data: normalizeHex(log.data),
  }
}

/**
 * Encodes raw viem receipts directly into final database rows.
 */
export function encodeBlockDataFromRpcReceipts(
  block: ChainBlock,
  receipts: TransactionReceipt[]
): IndexedBlockData {
  const receiptByHash = new Map<
    ReturnType<typeof normalizeHex>,
    TransactionReceipt
  >()
  let logCount = 0

  for (const receipt of receipts) {
    receiptByHash.set(normalizeHex(receipt.transactionHash), receipt)
    logCount += receipt.logs.length
  }

  const transactions = new Array<EncodedTransaction>(block.transactions.length)
  for (let i = 0; i < block.transactions.length; i++) {
    const tx = block.transactions[i]
    const receipt = receiptByHash.get(normalizeHex(tx.hash))
    if (!receipt) {
      throw new Error(
        `Block ${block.number} transaction ${tx.hash} has no matching receipt`
      )
    }
    const encoded = encodeTransaction(tx, receipt)
    transactions[i] = encoded
  }

  const logs = new Array<EncodedLog>(logCount)
  let logIndex = 0
  for (const receipt of receipts) {
    for (const log of receipt.logs) {
      const encoded = encodeLog(log)
      logs[logIndex] = encoded
      logIndex += 1
    }
  }

  const encodedBlock = encodeBlock(block)
  return {
    block: encodedBlock,
    transactions,
    logs,
  }
}

const EMPTY_TRIE_HASH =
  '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'

/**
 * Creates a placeholder block for a Filecoin null round.
 *
 * Filecoin can have heights with no tipset. The upstream Ethereum RPC reports
 * those as null-round errors, so the sync engine stores an empty placeholder row
 * using the previous real block hash. Because multiple null rounds can reuse a
 * hash, `blocks.hash` must be indexed but not unique.
 */
export function encodeNullRoundBlock(options: {
  number: bigint
  hash: Hash
  timestamp: bigint
}): IndexedBlockData {
  return {
    block: {
      number: options.number,
      timestamp: options.timestamp,
      hash: normalizeHex(options.hash),
      isNullRound: true,
      parentHash: normalizeHex(options.hash),
      miner: '0x0000000000000000000000000000000000000000',
      gasUsed: 0n,
      gasLimit: 30_000_000n,
      baseFeePerGas: 1_000_000_000n,
      size: 0n,
      stateRoot: EMPTY_TRIE_HASH,
      receiptsRoot: EMPTY_TRIE_HASH,
      transactionsRoot: EMPTY_TRIE_HASH,
      extraData: '0x',
      logsBloom: zeroLogsBloom,
    },
    transactions: [],
    logs: [],
  }
}

/**
 * Normalizes optional topic values while preserving `null` for sparse topics.
 */
function normalizeTopic(topic: Hex | undefined) {
  return topic ? normalizeHex(topic) : null
}

/**
 * Normalizes transaction signature components to canonical 32-byte hex.
 */
function normalizeSignatureComponent(
  value: Hex,
  field: 'r' | 's',
  txHash: ChainTransaction['hash']
) {
  return normalizeFixedWidthHex(
    value,
    32,
    `Transaction ${normalizeHex(txHash)} ${field}`
  )
}
