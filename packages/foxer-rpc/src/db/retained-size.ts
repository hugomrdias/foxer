import type { EncodedBlock, EncodedLog, EncodedTransaction } from '../types.ts'

const OBJECT_OVERHEAD_BYTES = 64
const ARRAY_OVERHEAD_BYTES = 32
const ARRAY_ENTRY_BYTES = 8
const STRING_OVERHEAD_BYTES = 24
const PROPERTY_SLOT_BYTES = 8
const BIGINT_BYTES = 16
const NUMBER_OR_BOOLEAN_BYTES = 8

function objectBytes(properties: number): number {
  return OBJECT_OVERHEAD_BYTES + properties * PROPERTY_SLOT_BYTES
}

function arrayBytes(entries: number): number {
  return ARRAY_OVERHEAD_BYTES + entries * ARRAY_ENTRY_BYTES
}

function stringBytes(value: string | null | undefined): number {
  return value == null ? 0 : STRING_OVERHEAD_BYTES + value.length * 2
}

function bigintBytes(value: bigint | null | undefined): number {
  return value == null ? 0 : BIGINT_BYTES
}

function numberBytes(value: number | null | undefined): number {
  return value == null ? 0 : NUMBER_OR_BOOLEAN_BYTES
}

function accessListBytes(value: EncodedTransaction['accessList']): number {
  if (value == null) return 0

  let bytes = arrayBytes(value.length)
  for (const item of value) {
    bytes += objectBytes(2)
    bytes += stringBytes(item.address)
    bytes += arrayBytes(item.storageKeys.length)
    for (const storageKey of item.storageKeys) {
      bytes += stringBytes(storageKey)
    }
  }
  return bytes
}

/** Fixed ownership overhead for one nested indexed-block result. */
export function indexedBlockContainerBytes(
  transactions: number,
  logs: number
): number {
  return objectBytes(3) + arrayBytes(transactions) + arrayBytes(logs)
}

/** Conservative retained-size estimate for one final block row. */
export function retainedBlockBytes(block: EncodedBlock): number {
  return (
    objectBytes(15) +
    bigintBytes(block.number) +
    stringBytes(block.hash) +
    NUMBER_OR_BOOLEAN_BYTES +
    stringBytes(block.parentHash) +
    bigintBytes(block.timestamp) +
    stringBytes(block.miner) +
    bigintBytes(block.gasUsed) +
    bigintBytes(block.gasLimit) +
    bigintBytes(block.baseFeePerGas) +
    bigintBytes(block.size) +
    stringBytes(block.stateRoot) +
    stringBytes(block.receiptsRoot) +
    stringBytes(block.transactionsRoot) +
    stringBytes(block.extraData) +
    stringBytes(block.logsBloom)
  )
}

/** Conservative retained-size estimate for one final transaction row. */
export function retainedTransactionBytes(tx: EncodedTransaction): number {
  return (
    objectBytes(23) +
    stringBytes(tx.hash) +
    bigintBytes(tx.blockNumber) +
    numberBytes(tx.transactionIndex) +
    stringBytes(tx.from) +
    stringBytes(tx.to) +
    stringBytes(tx.input) +
    bigintBytes(tx.value) +
    numberBytes(tx.nonce) +
    bigintBytes(tx.gas) +
    bigintBytes(tx.gasPrice) +
    bigintBytes(tx.maxFeePerGas) +
    bigintBytes(tx.maxPriorityFeePerGas) +
    numberBytes(tx.type) +
    bigintBytes(tx.v) +
    stringBytes(tx.r) +
    stringBytes(tx.s) +
    accessListBytes(tx.accessList) +
    numberBytes(tx.status) +
    bigintBytes(tx.receiptGasUsed) +
    bigintBytes(tx.cumulativeGasUsed) +
    bigintBytes(tx.effectiveGasPrice) +
    stringBytes(tx.contractAddress) +
    stringBytes(tx.logsBloom)
  )
}

/** Conservative retained-size estimate for one final log row. */
export function retainedLogBytes(log: EncodedLog): number {
  return (
    objectBytes(9) +
    bigintBytes(log.blockNumber) +
    numberBytes(log.logIndex) +
    numberBytes(log.transactionIndex) +
    stringBytes(log.address) +
    stringBytes(log.topic0) +
    stringBytes(log.topic1) +
    stringBytes(log.topic2) +
    stringBytes(log.topic3) +
    stringBytes(log.data)
  )
}
