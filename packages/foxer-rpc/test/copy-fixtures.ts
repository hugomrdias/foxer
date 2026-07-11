/// <reference types="bun" />

import { encodeCopyHeader, encodeCopyTrailer } from '../src/db/copy/protocol.ts'
import type {
  ChainReceipt,
  ChainTransaction,
  EncodedBlock,
  EncodedLog,
  EncodedTransaction,
  IndexedBlockData,
} from '../src/types.ts'
import { address, bytes32, emptyRoot, zeroLogsBloom } from './helpers.ts'

export function toHex(buffer: Buffer): string {
  return buffer.toString('hex')
}

export function drainCopyChunks(
  generator: Generator<
    Buffer,
    { rows: number; encodedBytes: number; chunks: number }
  >
) {
  const chunks: Buffer[] = []
  while (true) {
    const next = generator.next()
    if (next.done) {
      return { chunks, stats: next.value }
    }
    chunks.push(next.value)
  }
}

export function expectCompleteRowsInChunks(
  chunks: Buffer[],
  expectedRows: number
): void {
  const header = encodeCopyHeader()
  const trailer = encodeCopyTrailer()
  let rows = 0

  for (let chunkIndex = 0; chunkIndex < chunks.length; chunkIndex += 1) {
    const chunk = chunks[chunkIndex]
    let offset = 0
    let end = chunk.length

    if (chunkIndex === 0) {
      if (!chunk.subarray(0, header.length).equals(header)) {
        throw new Error('Missing COPY header in first chunk')
      }
      offset = header.length
    }
    if (chunkIndex === chunks.length - 1) {
      if (!chunk.subarray(end - trailer.length).equals(trailer)) {
        throw new Error('Missing COPY trailer in last chunk')
      }
      end -= trailer.length
    }

    while (offset < end) {
      if (offset + 2 > end) {
        throw new Error('Truncated row field count')
      }
      const fieldCount = chunk.readInt16BE(offset)
      offset += 2
      for (let field = 0; field < fieldCount; field += 1) {
        if (offset + 4 > end) {
          throw new Error('Truncated field length')
        }
        const length = chunk.readInt32BE(offset)
        offset += 4
        if (length >= 0) {
          if (offset + length > end) {
            throw new Error('Truncated field payload')
          }
          offset += length
        }
      }
      rows += 1
    }
    if (offset !== end) {
      throw new Error('Chunk contains trailing bytes')
    }
  }

  if (rows !== expectedRows) {
    throw new Error(`Expected ${expectedRows} rows, found ${rows}`)
  }
}

/** Test oracle: wraps one field value in the COPY tuple field-length prefix. */
export function encodeCopyField(value: Buffer | null): Buffer {
  if (value === null) {
    const nullField = Buffer.alloc(4)
    nullField.writeInt32BE(-1, 0)
    return nullField
  }

  const prefix = Buffer.alloc(4)
  prefix.writeInt32BE(value.length, 0)
  return Buffer.concat([prefix, value])
}

/** Test oracle: lazily yields one COPY row per chunk (header, rows, trailer). */
export function* encodeCopyChunks<T>(
  rows: Iterable<T>,
  encodeRow: (row: T) => Buffer
): Generator<Buffer> {
  yield encodeCopyHeader()
  for (const row of rows) {
    yield encodeRow(row)
  }
  yield encodeCopyTrailer()
}

/** Test oracle: concatenates every chunk from a COPY chunk generator. */
export function concatCopyChunks(chunks: Iterable<Buffer>): Buffer {
  const parts: Buffer[] = []
  for (const chunk of chunks) {
    parts.push(chunk)
  }

  return Buffer.concat(parts)
}

/** Test oracle: generic buffer-based log row encoder for byte-equivalence checks. */
export function encodeLogCopyRow(log: EncodedLog): Buffer {
  return encodeReferenceCopyRow([
    encodeReferenceInt8(log.blockNumber),
    encodeReferenceInt4(log.logIndex),
    encodeReferenceInt4(log.transactionIndex),
    decodeReferenceHex(log.address),
    log.topic0 == null ? null : decodeReferenceHex(log.topic0),
    log.topic1 == null ? null : decodeReferenceHex(log.topic1),
    log.topic2 == null ? null : decodeReferenceHex(log.topic2),
    log.topic3 == null ? null : decodeReferenceHex(log.topic3),
    decodeReferenceHex(log.data),
  ])
}

function encodeReferenceCopyRow(fields: readonly (Buffer | null)[]): Buffer {
  const encodedFields = fields.map(encodeCopyField)
  const row = Buffer.alloc(
    2 + encodedFields.reduce((total, field) => total + field.length, 0)
  )
  row.writeInt16BE(fields.length, 0)

  let offset = 2
  for (const field of encodedFields) {
    field.copy(row, offset)
    offset += field.length
  }
  return row
}

function encodeReferenceInt4(value: number): Buffer {
  const encoded = Buffer.alloc(4)
  encoded.writeInt32BE(value, 0)
  return encoded
}

function encodeReferenceInt8(value: bigint): Buffer {
  const encoded = Buffer.alloc(8)
  encoded.writeBigInt64BE(value, 0)
  return encoded
}

function decodeReferenceHex(hex: string): Buffer {
  if (
    !hex.startsWith('0x') ||
    (hex.length - 2) % 2 !== 0 ||
    !/^[0-9a-fA-F]*$/.test(hex.slice(2))
  ) {
    throw new Error(`Invalid normalized hex value: ${hex}`)
  }

  const byteLength = (hex.length - 2) / 2
  const encoded = Buffer.alloc(byteLength)
  const written = encoded.write(hex.slice(2), 0, byteLength, 'hex')
  if (written !== byteLength) {
    throw new Error(`Failed to encode normalized hex value: ${hex}`)
  }
  return encoded
}

export function sampleIndexedBatchEntry(
  block: EncodedBlock,
  transactions: EncodedTransaction[] = [],
  logs: EncodedLog[] = []
): IndexedBlockData {
  return { block, transactions, logs }
}

export function sampleIndexedBatch(): IndexedBlockData[] {
  const block = sampleBlock()
  return [sampleIndexedBatchEntry(block, [sampleTransaction()], [sampleLog()])]
}

export function sampleBlock(number = 1n): EncodedBlock {
  return {
    number,
    hash: hashFor(number),
    isNullRound: false,
    parentHash: hashFor(number - 1n),
    timestamp: number,
    miner: address('0'),
    gasUsed: 21_000n,
    gasLimit: 30_000_000n,
    baseFeePerGas: 1_000_000_000n,
    size: 1n,
    stateRoot: emptyRoot,
    receiptsRoot: emptyRoot,
    transactionsRoot: emptyRoot,
    extraData: '0x',
    logsBloom: zeroLogsBloom,
  }
}

export function sampleTransaction(blockNumber = 1n): EncodedTransaction {
  return {
    hash: hashFor(blockNumber + 1_000_000n),
    blockNumber,
    transactionIndex: 0,
    from: address('a'),
    to: address('b'),
    input: '0x',
    value: 123_456_789_012_345_678_901_234_567_890n,
    nonce: 0,
    gas: 21_000n,
    gasPrice: 2n,
    maxFeePerGas: 3n,
    maxPriorityFeePerGas: 1n,
    type: 2,
    v: 27n,
    r: bytes32('c'),
    s: bytes32('d'),
    accessList: [{ address: address('d'), storageKeys: [bytes32('e')] }],
    status: 1,
    receiptGasUsed: 21_000n,
    cumulativeGasUsed: 21_000n,
    effectiveGasPrice: 2n,
    contractAddress: address('e'),
    logsBloom: zeroLogsBloom,
  }
}

export function sampleLog(blockNumber = 1n): EncodedLog {
  return {
    blockNumber,
    logIndex: 0,
    transactionIndex: 0,
    address: address('c'),
    topic0: bytes32('f'),
    topic1: bytes32('1'),
    topic2: bytes32('2'),
    topic3: bytes32('3'),
    data: '0xabcd',
  }
}

export function hashFor(value: bigint) {
  return `0x${value.toString(16).padStart(64, '0')}` as const
}

export function copyTransaction(
  overrides: Partial<ChainTransaction> = {}
): ChainTransaction {
  return {
    hash: bytes32('a'),
    blockNumber: 1n,
    transactionIndex: 0,
    from: address('a'),
    to: address('b'),
    input: '0x',
    value: 0n,
    nonce: 0,
    gas: 21_000n,
    gasPrice: 1n,
    maxFeePerGas: 1n,
    maxPriorityFeePerGas: 1n,
    type: 'eip1559',
    v: 1n,
    r: bytes32('c'),
    s: bytes32('d'),
    accessList: [],
    ...overrides,
  } as unknown as ChainTransaction
}

export function copyReceipt(
  overrides: Partial<ChainReceipt> = {}
): ChainReceipt {
  return {
    transactionHash: bytes32('a'),
    transactionIndex: 0,
    blockHash: bytes32('1'),
    blockNumber: 1n,
    from: address('a'),
    to: address('b'),
    cumulativeGasUsed: 21_000n,
    gasUsed: 21_000n,
    contractAddress: null,
    logs: [],
    status: 'success',
    effectiveGasPrice: 1n,
    type: 'eip1559',
    logsBloom: zeroLogsBloom,
    ...overrides,
  }
}
