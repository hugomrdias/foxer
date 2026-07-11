/**
 * PostgreSQL binary COPY protocol encoders for blocks and transactions.
 *
 * Generic row/tuple helpers live here; the hot-path log codec is in log-codec.ts.
 */
import type { Hex } from 'viem'

import type { EncodedBlock, EncodedTransaction } from '../../types.ts'
import { COPY_SIGNATURE, NUMERIC_NEG, NUMERIC_POS } from './constants.ts'

/**
 * Builds the complete 19-byte PostgreSQL binary COPY header prefix.
 */
export function encodeCopyHeader(): Buffer {
  const header = Buffer.alloc(19)
  COPY_SIGNATURE.copy(header, 0)
  header.writeInt32BE(0, 11)
  header.writeInt32BE(0, 15)
  return header
}

/**
 * Builds the PostgreSQL binary COPY file trailer.
 */
export function encodeCopyTrailer(): Buffer {
  const trailer = Buffer.alloc(2)
  trailer.writeInt16BE(-1, 0)
  return trailer
}

/**
 * Encodes one COPY tuple from already-serialized field payloads.
 */
export function encodeCopyRow(fields: readonly (Buffer | null)[]): Buffer {
  let totalSize = 2
  for (const field of fields) {
    totalSize += field === null ? 4 : 4 + field.length
  }

  const row = Buffer.alloc(totalSize)
  row.writeInt16BE(fields.length, 0)
  let offset = 2

  for (const field of fields) {
    if (field === null) {
      row.writeInt32BE(-1, offset)
      offset += 4
      continue
    }

    row.writeInt32BE(field.length, offset)
    offset += 4
    field.copy(row, offset)
    offset += field.length
  }

  return row
}

/**
 * Encodes a PostgreSQL `smallint` field for binary COPY.
 */
export function encodeCopyInt2(value: number): Buffer {
  const buf = Buffer.alloc(2)
  buf.writeInt16BE(value, 0)
  return buf
}

/**
 * Encodes a PostgreSQL `integer` field for binary COPY.
 */
export function encodeCopyInt4(value: number): Buffer {
  const buf = Buffer.alloc(4)
  buf.writeInt32BE(value, 0)
  return buf
}

/**
 * Encodes a PostgreSQL `bigint` field for binary COPY.
 */
export function encodeCopyInt8(value: bigint): Buffer {
  const buf = Buffer.alloc(8)
  buf.writeBigInt64BE(value, 0)
  return buf
}

/**
 * Encodes a PostgreSQL `boolean` field for binary COPY.
 */
export function encodeCopyBoolean(value: boolean): Buffer {
  return Buffer.from([value ? 1 : 0])
}

/**
 * Encodes a PostgreSQL `numeric(78,0)` field for binary COPY.
 *
 * Values are represented in PostgreSQL's base-10000 external numeric format.
 */
export function encodeCopyNumeric78(value: bigint): Buffer {
  if (value === 0n) {
    const zero = Buffer.alloc(8)
    zero.writeInt16BE(0, 0)
    zero.writeInt16BE(0, 2)
    zero.writeInt16BE(NUMERIC_POS, 4)
    zero.writeInt16BE(0, 6)
    return zero
  }

  const negative = value < 0n
  let remaining = negative ? -value : value
  const digits: number[] = []

  while (remaining > 0n) {
    digits.push(Number(remaining % 10_000n))
    remaining /= 10_000n
  }

  digits.reverse()
  const weight = digits.length - 1
  while (digits.at(-1) === 0) {
    digits.pop()
  }

  const buf = Buffer.alloc(8 + digits.length * 2)
  buf.writeInt16BE(digits.length, 0)
  buf.writeInt16BE(weight, 2)
  buf.writeInt16BE(negative ? NUMERIC_NEG : NUMERIC_POS, 4)
  buf.writeInt16BE(0, 6)

  for (let i = 0; i < digits.length; i++) {
    buf.writeInt16BE(digits[i], 8 + i * 2)
  }

  return buf
}

/**
 * Validates normalized `0x`-prefixed hex and returns its payload byte length.
 */
export function hexPayloadByteLength(hex: Hex): number {
  if (
    !hex.startsWith('0x') ||
    (hex.length - 2) % 2 !== 0 ||
    !/^[0-9a-fA-F]*$/.test(hex.slice(2))
  ) {
    throw new Error(`Invalid normalized hex value: ${hex}`)
  }

  return (hex.length - 2) / 2
}

/**
 * Encodes a normalized hex string as raw PostgreSQL `bytea` bytes.
 */
export function encodeCopyBytea(hex: Hex): Buffer {
  const length = hexPayloadByteLength(hex)
  const encoded = Buffer.alloc(length)
  const written = encoded.write(hex.slice(2), 0, length, 'hex')
  if (written !== length) {
    throw new Error(`Failed to encode normalized hex value: ${hex}`)
  }
  return encoded
}

/**
 * Encodes a PostgreSQL `jsonb` field for binary COPY.
 */
export function encodeCopyJsonb(value: unknown): Buffer {
  const json = JSON.stringify(value)
  const jsonBytes = Buffer.from(json, 'utf8')
  const buf = Buffer.alloc(1 + jsonBytes.length)
  buf[0] = 1
  jsonBytes.copy(buf, 1)
  return buf
}

/**
 * Encodes one `blocks` row for binary COPY.
 */
export function encodeBlockCopyRow(block: EncodedBlock): Buffer {
  return encodeCopyRow([
    encodeCopyInt8(block.number),
    encodeCopyBytea(block.hash),
    encodeCopyBoolean(block.isNullRound ?? false),
    encodeCopyBytea(block.parentHash),
    encodeCopyInt8(block.timestamp),
    encodeCopyBytea(block.miner),
    encodeCopyInt8(block.gasUsed),
    encodeCopyInt8(block.gasLimit),
    block.baseFeePerGas == null ? null : encodeCopyInt8(block.baseFeePerGas),
    encodeCopyInt8(block.size),
    encodeCopyBytea(block.stateRoot),
    encodeCopyBytea(block.receiptsRoot),
    encodeCopyBytea(block.transactionsRoot),
    encodeCopyBytea(block.extraData),
    encodeCopyBytea(block.logsBloom),
  ])
}

/**
 * Encodes one `transactions` row for binary COPY.
 */
export function encodeTransactionCopyRow(tx: EncodedTransaction): Buffer {
  return encodeCopyRow([
    encodeCopyBytea(tx.hash),
    encodeCopyInt8(tx.blockNumber),
    encodeCopyInt4(tx.transactionIndex),
    encodeCopyBytea(tx.from),
    tx.to == null ? null : encodeCopyBytea(tx.to),
    encodeCopyBytea(tx.input),
    encodeCopyNumeric78(tx.value),
    encodeCopyInt4(tx.nonce),
    encodeCopyInt8(tx.gas),
    tx.gasPrice == null ? null : encodeCopyNumeric78(tx.gasPrice),
    tx.maxFeePerGas == null ? null : encodeCopyNumeric78(tx.maxFeePerGas),
    tx.maxPriorityFeePerGas == null
      ? null
      : encodeCopyNumeric78(tx.maxPriorityFeePerGas),
    encodeCopyInt2(tx.type),
    tx.v == null ? null : encodeCopyNumeric78(tx.v),
    tx.r == null ? null : encodeCopyBytea(tx.r),
    tx.s == null ? null : encodeCopyBytea(tx.s),
    tx.accessList == null ? null : encodeCopyJsonb(tx.accessList),
    tx.status == null ? null : encodeCopyInt4(tx.status),
    tx.receiptGasUsed == null ? null : encodeCopyInt8(tx.receiptGasUsed),
    tx.cumulativeGasUsed == null ? null : encodeCopyInt8(tx.cumulativeGasUsed),
    tx.effectiveGasPrice == null
      ? null
      : encodeCopyNumeric78(tx.effectiveGasPrice),
    tx.contractAddress == null ? null : encodeCopyBytea(tx.contractAddress),
  ])
}

function quoteIdentifier(identifier: string): string {
  return `"${identifier.replaceAll('"', '""')}"`
}

/**
 * Builds COPY SQL with explicitly ordered, quoted table and column identifiers.
 */
export function buildCopySql(
  table: string,
  columns: readonly string[]
): string {
  const columnList = columns.map(quoteIdentifier).join(', ')
  return `COPY ${quoteIdentifier(table)} (${columnList}) FROM STDIN WITH (FORMAT binary)`
}
