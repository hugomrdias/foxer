import type { Hash, Hex } from 'viem'

import type {
  ChainBlock,
  ChainReceipt,
  ChainTransaction,
  EncodedBlock,
  EncodedLog,
  EncodedTransaction,
  IndexedBlockData,
} from '../types.ts'
import { normalizeHex } from '../utils/hex.ts'

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
  }
}

/**
 * Converts a viem transaction plus its optional receipt into one DB row.
 *
 * Receipt fields are merged into `transactions` to avoid a separate receipts
 * table. Missing receipt values are represented as `null`, which can happen for
 * malformed upstream responses or placeholder/null-round data.
 */
export function encodeTransaction(
  tx: ChainTransaction,
  receipt?: ChainReceipt
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
    type: tx.type,
    v: tx.v ?? null,
    r: tx.r ? normalizeHex(tx.r) : null,
    s: tx.s ? normalizeHex(tx.s) : null,
    accessList: tx.accessList ?? null,
    status: encodeStatus(receipt?.status),
    receiptGasUsed: receipt?.gasUsed ?? null,
    cumulativeGasUsed: receipt?.cumulativeGasUsed ?? null,
    effectiveGasPrice: receipt?.effectiveGasPrice ?? null,
    contractAddress: receipt?.contractAddress
      ? normalizeHex(receipt.contractAddress)
      : null,
  }
}

/**
 * Converts receipt logs into compact log rows.
 *
 * The row keeps positional identifiers (`blockNumber`, `transactionIndex`,
 * `logIndex`) plus address/topics/data. `blockHash` and `transactionHash` are
 * recovered by joins at API time to keep the high-cardinality log table smaller.
 */
export function encodeReceiptLogs(receipt: ChainReceipt): EncodedLog[] {
  return receipt.logs.map((log) => ({
    blockNumber: log.blockNumber,
    logIndex: log.logIndex,
    transactionIndex: log.transactionIndex,
    address: normalizeHex(log.address),
    topic0: normalizeTopic(log.topics[0]),
    topic1: normalizeTopic(log.topics[1]),
    topic2: normalizeTopic(log.topics[2]),
    topic3: normalizeTopic(log.topics[3]),
    data: normalizeHex(log.data),
  }))
}

/**
 * Combines a fetched block and its block receipts into all rows needed by sync.
 *
 * Receipts are keyed by transaction hash so each transaction can be enriched
 * with its receipt fields, while logs are flattened from every receipt.
 */
export function encodeBlockData(
  block: ChainBlock,
  receipts: ChainReceipt[]
): IndexedBlockData {
  const receiptByHash = new Map(
    receipts.map((receipt) => [normalizeHex(receipt.transactionHash), receipt])
  )

  return {
    block: encodeBlock(block),
    transactions: block.transactions.map((tx) =>
      encodeTransaction(tx, receiptByHash.get(normalizeHex(tx.hash)))
    ),
    logs: receipts.flatMap(encodeReceiptLogs),
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
}): IndexedBlockData {
  return {
    block: {
      number: options.number,
      timestamp: BigInt(Math.floor(Date.now() / 1000)),
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
    },
    transactions: [],
    logs: [],
  }
}

/**
 * Maps receipt status strings to Ethereum JSON-RPC status numbers.
 */
function encodeStatus(status: ChainReceipt['status'] | undefined) {
  if (status == null) return null
  return status === 'success' ? 1 : 0
}

/**
 * Normalizes optional topic values while preserving `null` for sparse topics.
 */
function normalizeTopic(topic: Hex | undefined) {
  return topic ? normalizeHex(topic) : null
}
