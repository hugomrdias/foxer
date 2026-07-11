/// <reference types="bun" />

import { describe, expect, test } from 'bun:test'
import type { Hex } from 'viem'

import {
  BLOCK_COPY_COLUMNS,
  LOG_COPY_COLUMNS,
  TRANSACTION_COPY_COLUMNS,
} from '../src/db/copy/constants.ts'
import { logCopyRowSize, writeLogCopyRow } from '../src/db/copy/log-codec.ts'
import {
  buildCopySql,
  encodeBlockCopyRow,
  encodeCopyBoolean,
  encodeCopyBytea,
  encodeCopyHeader,
  encodeCopyInt2,
  encodeCopyInt4,
  encodeCopyInt8,
  encodeCopyJsonb,
  encodeCopyNumeric78,
  encodeCopyRow,
  encodeCopyTrailer,
  encodeTransactionCopyRow,
} from '../src/db/copy/protocol.ts'
import { encodeTransaction } from '../src/db/encode.ts'
import { iterateBlocks } from '../src/db/indexed-batch.ts'
import type { EncodedLog } from '../src/types.ts'
import {
  copyTransaction,
  encodeCopyChunks,
  encodeCopyField,
  encodeLogCopyRow,
  sampleBlock,
  sampleIndexedBatch,
  sampleLog,
  sampleTransaction,
  toHex,
} from './copy-fixtures.ts'
import { bytes32 } from './helpers.ts'

describe('binary COPY protocol', () => {
  test('encodes scalar PostgreSQL binary field values', () => {
    expect(toHex(encodeCopyInt2(1))).toBe('0001')
    expect(toHex(encodeCopyInt4(42))).toBe('0000002a')
    expect(toHex(encodeCopyInt8(1n))).toBe('0000000000000001')
    expect(toHex(encodeCopyInt8(-1n))).toBe('ffffffffffffffff')
    expect(toHex(encodeCopyBoolean(true))).toBe('01')
    expect(toHex(encodeCopyBoolean(false))).toBe('00')
    expect(toHex(encodeCopyBytea('0xabcd'))).toBe('abcd')
    expect(toHex(encodeCopyBytea('0x'))).toBe('')
    expect(toHex(encodeCopyField(null))).toBe('ffffffff')
    expect(toHex(encodeCopyJsonb([]))).toBe('015b5d')
  })

  test('rejects malformed, odd-length, and non-hex bytea values', () => {
    expect(() => encodeCopyBytea('abcd' as Hex)).toThrow(
      'Invalid normalized hex value'
    )
    expect(() => encodeCopyBytea('0xabc' as Hex)).toThrow(
      'Invalid normalized hex value'
    )
    expect(() => encodeCopyBytea('0xzz' as Hex)).toThrow(
      'Invalid normalized hex value'
    )
  })

  test('encodes normalized transaction signature components for COPY', () => {
    const reportedS =
      '0xd43a8314fa21972a1415d02b8fd9711d4d4b3c98dec38f4b5e4748d1400525f' as Hex
    const tx = encodeTransaction(
      copyTransaction({
        hash: bytes32('f'),
        r: '0xabc' as Hex,
        s: reportedS,
      })
    )

    expect(() => encodeTransactionCopyRow(tx)).not.toThrow()
    expect(tx.s).toBe(
      '0x0d43a8314fa21972a1415d02b8fd9711d4d4b3c98dec38f4b5e4748d1400525f'
    )
    expect(tx.r).toBe(
      '0x0000000000000000000000000000000000000000000000000000000000000abc'
    )
  })

  test('still rejects odd-length bytea on ordinary COPY fields', () => {
    const tx = {
      ...sampleTransaction(),
      input: '0xabc' as Hex,
    }

    expect(() => encodeTransactionCopyRow(tx)).toThrow(
      'Invalid normalized hex value'
    )
  })

  test('encodes numeric(78,0) including zero and negative values', () => {
    expect(toHex(encodeCopyNumeric78(0n))).toBe('0000000000000000')
    expect(toHex(encodeCopyNumeric78(12_345n))).toBe('000200010000000000010929')
    expect(toHex(encodeCopyNumeric78(-1n))).toBe('00010000400000000001')
    expect(toHex(encodeCopyNumeric78(10_000n))).toBe('00010001000000000001')
    expect(toHex(encodeCopyNumeric78(-10_000n))).toBe('00010001400000000001')
    expect(toHex(encodeCopyNumeric78(100_000_000n))).toBe(
      '00010002000000000001'
    )
    expect(
      toHex(encodeCopyNumeric78(123_456_789_012_345_678_901_234_567_890n))
    ).toBe('0008000700000000000c0d801ed204d2162e23340d801ed2')
  })

  test('frames COPY tuples', () => {
    const row = encodeCopyRow([
      encodeCopyInt4(7),
      null,
      encodeCopyBoolean(true),
    ])
    expect(toHex(row)).toBe(
      '0003' + '00000004' + '00000007' + 'ffffffff' + '00000001' + '01'
    )

    expect(toHex(encodeCopyHeader())).toBe(
      '5047434f50590aff0d0a000000000000000000'
    )
    expect(toHex(encodeCopyTrailer())).toBe('ffff')
  })

  test('streams COPY chunks lazily in framing order', () => {
    const encoded: number[] = []
    const chunks = encodeCopyChunks([1, 2], (value) => {
      encoded.push(value)
      return encodeCopyInt4(value)
    })

    expect(encoded).toEqual([])
    expect(toHex(chunks.next().value as Buffer)).toBe(toHex(encodeCopyHeader()))
    expect(encoded).toEqual([])
    expect(toHex(chunks.next().value as Buffer)).toBe('00000001')
    expect(encoded).toEqual([1])
    expect(toHex(chunks.next().value as Buffer)).toBe('00000002')
    expect(encoded).toEqual([1, 2])
    expect(toHex(chunks.next().value as Buffer)).toBe(
      toHex(encodeCopyTrailer())
    )
    expect(chunks.next().done).toBe(true)
  })

  test('streams indexed batches without flattening row arrays', () => {
    const batch = sampleIndexedBatch()
    const encoded: string[] = []
    const chunks = encodeCopyChunks(iterateBlocks(batch), (block) => {
      encoded.push(block.hash)
      return encodeBlockCopyRow(block)
    })

    expect(encoded).toEqual([])
    expect(toHex(chunks.next().value as Buffer)).toBe(toHex(encodeCopyHeader()))
    expect(encoded).toEqual([])
    chunks.next()
    expect(encoded).toEqual([batch[0].block.hash])
    for (const _ of chunks) {
      // drain generator
    }
    expect(encoded).toEqual([batch[0].block.hash])
  })

  test('quotes every COPY identifier', () => {
    expect(buildCopySql('transactions', TRANSACTION_COPY_COLUMNS)).toContain(
      '"from", "to", "input"'
    )
    expect(buildCopySql('a"b', ['c"d'])).toBe(
      'COPY "a""b" ("c""d") FROM STDIN WITH (FORMAT binary)'
    )
  })

  test('uses fixed column ordering for table row encoders', () => {
    expect(BLOCK_COPY_COLUMNS).toEqual([
      'number',
      'hash',
      'is_null_round',
      'parent_hash',
      'timestamp',
      'miner',
      'gas_used',
      'gas_limit',
      'base_fee_per_gas',
      'size',
      'state_root',
      'receipts_root',
      'transactions_root',
      'extra_data',
      'logs_bloom',
    ])
    expect(TRANSACTION_COPY_COLUMNS).toEqual([
      'hash',
      'block_number',
      'transaction_index',
      'from',
      'to',
      'input',
      'value',
      'nonce',
      'gas',
      'gas_price',
      'max_fee_per_gas',
      'max_priority_fee_per_gas',
      'type',
      'v',
      'r',
      's',
      'access_list',
      'status',
      'receipt_gas_used',
      'cumulative_gas_used',
      'effective_gas_price',
      'contract_address',
    ])
    expect(LOG_COPY_COLUMNS).toEqual([
      'block_number',
      'log_index',
      'transaction_index',
      'address',
      'topic0',
      'topic1',
      'topic2',
      'topic3',
      'data',
    ])

    const block = sampleBlock()
    const tx = sampleTransaction()
    const log = sampleLog()

    expect(encodeBlockCopyRow(block).subarray(0, 2).readInt16BE(0)).toBe(15)
    expect(encodeTransactionCopyRow(tx).subarray(0, 2).readInt16BE(0)).toBe(22)
    expect(encodeLogCopyRow(log).subarray(0, 2).readInt16BE(0)).toBe(9)
  })
})

describe('direct log COPY codec', () => {
  test('matches encodeLogCopyRow byte-for-byte', () => {
    const cases = [
      sampleLog(),
      {
        ...sampleLog(42n),
        topic0: null,
        topic1: null,
        topic2: null,
        topic3: null,
        data: '0x',
      },
      {
        ...sampleLog(43n),
        topic0: bytes32('aa'),
        topic1: bytes32('bb'),
        topic2: null,
        topic3: bytes32('cc'),
        data: `0x${'ff'.repeat(512)}`,
      },
      {
        ...sampleLog(44n),
        logIndex: 2_147_483_647,
        transactionIndex: -1,
        data: '0x0102',
      },
    ] as EncodedLog[]

    for (const log of cases) {
      const expected = encodeLogCopyRow(log)
      const actual = Buffer.alloc(logCopyRowSize(log))
      writeLogCopyRow(log, actual, 0)
      expect(toHex(actual)).toBe(toHex(expected))
    }
  })

  test('writes byte-identical rows at a nonzero offset', () => {
    const log = sampleLog()
    const expected = encodeLogCopyRow(log)
    const offset = 7
    const destination = Buffer.alloc(offset + expected.length + 5, 0xaa)

    expect(writeLogCopyRow(log, destination, offset)).toBe(expected.length)
    expect(toHex(destination.subarray(offset, offset + expected.length))).toBe(
      toHex(expected)
    )
    expect(toHex(destination.subarray(0, offset))).toBe(
      toHex(Buffer.alloc(offset, 0xaa))
    )
    expect(toHex(destination.subarray(offset + expected.length))).toBe(
      toHex(Buffer.alloc(5, 0xaa))
    )
  })

  test('rejects malformed hex consistently on the direct path', () => {
    for (const data of ['abcd', '0xabc', '0xgg'] as Hex[]) {
      const log = { ...sampleLog(), data }
      expect(() => logCopyRowSize(log)).toThrow('Invalid normalized hex value')
      expect(() => writeLogCopyRow(log, Buffer.alloc(1_024), 0)).toThrow(
        'Invalid normalized hex value'
      )
    }
  })
})
