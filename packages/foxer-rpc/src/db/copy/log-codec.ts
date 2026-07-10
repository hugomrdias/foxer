/**
 * Direct in-buffer log COPY codec — avoids per-row Buffer allocations on the hot path.
 *
 * Size and write helpers are paired; callers must pre-size chunks via logCopyRowSize.
 */
import type { Hex } from 'viem'

import type { EncodedLog } from '../../types.ts'
import { LOG_COPY_FIELD_COUNT } from './constants.ts'
import { hexPayloadByteLength } from './protocol.ts'

function nullableHexFieldSize(hex: Hex | null | undefined): number {
  if (hex == null) {
    return 4
  }

  return 4 + hexPayloadByteLength(hex)
}

/**
 * Returns the exact encoded byte length of one `logs` COPY row.
 */
export function logCopyRowSize(log: EncodedLog): number {
  return (
    2 +
    4 +
    8 +
    4 +
    4 +
    4 +
    4 +
    4 +
    hexPayloadByteLength(log.address) +
    nullableHexFieldSize(log.topic0) +
    nullableHexFieldSize(log.topic1) +
    nullableHexFieldSize(log.topic2) +
    nullableHexFieldSize(log.topic3) +
    4 +
    hexPayloadByteLength(log.data)
  )
}

/**
 * Writes one `logs` COPY row directly into `destination` at `offset`.
 *
 * Returns the number of bytes written.
 */
export function writeLogCopyRow(
  log: EncodedLog,
  destination: Buffer,
  offset: number
): number {
  const expectedSize = logCopyRowSize(log)
  let cursor = offset
  destination.writeInt16BE(LOG_COPY_FIELD_COUNT, cursor)
  cursor += 2

  destination.writeInt32BE(8, cursor)
  cursor += 4
  destination.writeBigInt64BE(log.blockNumber, cursor)
  cursor += 8

  destination.writeInt32BE(4, cursor)
  cursor += 4
  destination.writeInt32BE(log.logIndex, cursor)
  cursor += 4

  destination.writeInt32BE(4, cursor)
  cursor += 4
  destination.writeInt32BE(log.transactionIndex, cursor)
  cursor += 4

  cursor = writeCopyHexByteaField(log.address, destination, cursor)
  cursor = writeCopyNullableHexByteaField(log.topic0, destination, cursor)
  cursor = writeCopyNullableHexByteaField(log.topic1, destination, cursor)
  cursor = writeCopyNullableHexByteaField(log.topic2, destination, cursor)
  cursor = writeCopyNullableHexByteaField(log.topic3, destination, cursor)
  cursor = writeCopyHexByteaField(log.data, destination, cursor)

  const written = cursor - offset
  if (written !== expectedSize) {
    throw new Error(
      `Log COPY row size mismatch: expected ${expectedSize}, wrote ${written}`
    )
  }
  return written
}

function writeCopyHexByteaField(
  hex: Hex,
  destination: Buffer,
  offset: number
): number {
  const length = hexPayloadByteLength(hex)
  destination.writeInt32BE(length, offset)
  const cursor = offset + 4
  const written = destination.write(hex.slice(2), cursor, length, 'hex')
  if (written !== length) {
    throw new Error(`Failed to encode normalized hex value: ${hex}`)
  }

  return cursor + written
}

function writeCopyNullableHexByteaField(
  hex: Hex | null | undefined,
  destination: Buffer,
  offset: number
): number {
  if (hex == null) {
    destination.writeInt32BE(-1, offset)
    return offset + 4
  }

  return writeCopyHexByteaField(hex, destination, offset)
}
