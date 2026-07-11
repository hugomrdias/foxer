import { expect, test } from 'bun:test'
import type { Hex } from 'viem'

import {
  decodeBlock,
  decodeReceipt,
  decodeTransaction,
} from '../src/api/decode.ts'
import {
  encodeBlock,
  encodeBlockData,
  encodeNullRoundBlock,
  encodeTransaction,
  encodeTransactionType,
} from '../src/db/encode.ts'
import { schema } from '../src/db/schema/index.ts'
import type {
  ChainBlock,
  ChainReceipt,
  ChainTransaction,
  EncodedBlock,
} from '../src/types.ts'
import { normalizeFixedWidthHex } from '../src/utils/hex.ts'
import {
  address,
  bytes32,
  emptyRoot,
  withTestDatabase,
  zeroLogsBloom,
} from './helpers.ts'

test('normalizes and persists the upstream block logs bloom', async () => {
  const encoded = encodeBlock(chainBlock({ logsBloom: '0xAB' }))
  const expectedBloom = `0x${'00'.repeat(255)}ab` as Hex

  expect(encoded.logsBloom).toBe(expectedBloom)

  await withTestDatabase(async (db) => {
    await db.insert(schema.blocks).values(encoded)
    const [stored] = await db.select().from(schema.blocks)
    expect(stored.logsBloom).toBe(expectedBloom)

    const decoded = decodeBlock(stored, { full: false, rows: [] }, 314_159)
    expect(decoded.logsBloom).toBe(expectedBloom)
  })
})

test('rejects block logs blooms wider than 256 bytes', () => {
  expect(() =>
    encodeBlock(chainBlock({ logsBloom: `0x${'ff'.repeat(257)}` }))
  ).toThrow('logs bloom: hex value exceeds 256 bytes')
})

test('stores the canonical zero bloom for null rounds', () => {
  const encoded = encodeNullRoundBlock({
    number: 2n,
    hash: bytes32('1'),
    timestamp: 1n,
  })

  expect(encoded.block.logsBloom).toBe(zeroLogsBloom)
})

test('rejects block transactions without matching receipts', () => {
  const tx = transaction({ hash: bytes32('9') })

  expect(() => encodeBlockData(chainBlock({ transactions: [tx] }), [])).toThrow(
    `transaction ${tx.hash} has no matching receipt`
  )
})

test('persists receipt logs blooms and returns stored values unchanged', async () => {
  await withTestDatabase(async (db) => {
    const txHash = bytes32('8')
    const receiptBloom = `0x${'cd'.repeat(256)}` as Hex
    const tx = encodeTransaction(
      transaction({ hash: txHash }),
      receipt({ transactionHash: txHash, logsBloom: receiptBloom })
    )
    const block = blockRow(1n)

    await db.insert(schema.blocks).values(block)
    await db.insert(schema.transactions).values(tx)

    const [storedBlock] = await db.select().from(schema.blocks)
    const [storedTx] = await db.select().from(schema.transactions)
    expect(storedTx.logsBloom).toBe(receiptBloom)
    expect(decodeReceipt(storedTx, storedBlock, []).logsBloom).toBe(
      receiptBloom
    )

    const unvalidatedStoredBloom = '0xdead'
    expect(
      decodeReceipt(
        { ...storedTx, logsBloom: unvalidatedStoredBloom },
        storedBlock,
        []
      ).logsBloom
    ).toBe(unvalidatedStoredBloom)
  })
})

test('normalizes transaction signature components to canonical 32-byte hex', () => {
  const txHash = bytes32('f')
  const reportedS =
    '0xd43a8314fa21972a1415d02b8fd9711d4d4b3c98dec38f4b5e4748d1400525f' as Hex
  const expectedS =
    '0x0d43a8314fa21972a1415d02b8fd9711d4d4b3c98dec38f4b5e4748d1400525f' as const

  const encoded = encodeTransaction(
    transaction({
      hash: txHash,
      r: '0xf' as Hex,
      s: reportedS,
    }),
    receipt({ transactionHash: txHash })
  )

  expect(encoded.r).toBe(
    '0x000000000000000000000000000000000000000000000000000000000000000f'
  )
  expect(encoded.s).toBe(expectedS)
  expect(encoded.r).toMatch(/^0x[0-9a-f]{64}$/)
  expect(encoded.s).toMatch(/^0x[0-9a-f]{64}$/)
})

test('preserves already 32-byte and lowercases uppercase signature hex', () => {
  const txHash = bytes32('1')
  const r = bytes32('c').toUpperCase() as Hex
  const s = bytes32('d')

  const encoded = encodeTransaction(
    transaction({ hash: txHash, r, s }),
    receipt({ transactionHash: txHash })
  )

  expect(encoded.r).toBe(bytes32('c'))
  expect(encoded.s).toBe(bytes32('d'))
})

test('keeps missing signature components as null', () => {
  const encoded = encodeTransaction(
    transaction({
      hash: bytes32('2'),
      r: undefined,
      s: undefined,
    }),
    receipt({ transactionHash: bytes32('2') })
  )

  expect(encoded.r).toBeNull()
  expect(encoded.s).toBeNull()
})

test('rejects invalid and oversized transaction signature components', () => {
  const txHash = bytes32('3')

  for (const empty of ['0x', '0X'] as Hex[]) {
    expect(() =>
      encodeTransaction(
        transaction({ hash: txHash, r: empty, s: bytes32('d') }),
        receipt({ transactionHash: txHash })
      )
    ).toThrow(`Transaction ${txHash} r: invalid hex value: ${empty}`)
  }

  expect(() =>
    encodeTransaction(
      transaction({ hash: txHash, r: '0xzz' as Hex, s: bytes32('d') }),
      receipt({ transactionHash: txHash })
    )
  ).toThrow(`Transaction ${txHash} r: invalid hex value: 0xzz`)

  expect(() =>
    encodeTransaction(
      transaction({
        hash: txHash,
        r: bytes32('c'),
        s: `0x${'ff'.repeat(65)}` as Hex,
      }),
      receipt({ transactionHash: txHash })
    )
  ).toThrow(`Transaction ${txHash} s: hex value exceeds 32 bytes`)
})

test('rejects invalid fixed hex byte widths', () => {
  for (const byteWidth of [
    0,
    -1,
    1.5,
    Number.NaN,
    Number.POSITIVE_INFINITY,
    Number.MAX_SAFE_INTEGER + 1,
  ]) {
    expect(() => normalizeFixedWidthHex('0xf', byteWidth)).toThrow(
      'byte width must be a positive safe integer'
    )
  }
})

test('roundtrips normalized signature components through Drizzle', async () => {
  await withTestDatabase(async (db) => {
    const txHash = bytes32('4')
    const reportedS =
      '0xd43a8314fa21972a1415d02b8fd9711d4d4b3c98dec38f4b5e4748d1400525f' as Hex
    const expectedS =
      '0x0d43a8314fa21972a1415d02b8fd9711d4d4b3c98dec38f4b5e4748d1400525f' as const
    const tx = encodeTransaction(
      transaction({
        hash: txHash,
        r: '0xabc' as Hex,
        s: reportedS,
      }),
      receipt({ transactionHash: txHash })
    )
    const block = blockRow(1n)

    await db.insert(schema.blocks).values(block)
    await db.insert(schema.transactions).values(tx)

    const [storedBlock] = await db.select().from(schema.blocks)
    const [storedTx] = await db.select().from(schema.transactions)

    expect(storedTx.r).toBe(
      '0x0000000000000000000000000000000000000000000000000000000000000abc'
    )
    expect(storedTx.s).toBe(expectedS)

    const decodedTx = decodeTransaction(storedTx, 314_159, storedBlock)
    expect(decodedTx.r).toBe(storedTx.r)
    expect(decodedTx.s).toBe(storedTx.s)
  })
})

test('encodes oversized fee values and unknown transaction types', async () => {
  await withTestDatabase(async (db) => {
    const largeFee = 2n ** 63n
    const txHash = bytes32('a')
    const block = blockRow(1n)
    const tx = encodeTransaction(
      transaction({
        hash: txHash,
        maxFeePerGas: largeFee,
        type: '0x7e',
      }),
      receipt({ transactionHash: txHash, type: '0x7e' })
    )

    expect(encodeTransactionType('0x7e')).toBe(126)
    expect(tx.type).toBe(126)

    await db.insert(schema.blocks).values(block)
    await db.insert(schema.transactions).values(tx)

    const [storedBlock] = await db.select().from(schema.blocks)
    const [storedTx] = await db.select().from(schema.transactions)

    expect(storedTx.maxFeePerGas).toBe(largeFee)

    const decodedTx = decodeTransaction(storedTx, 314_159, storedBlock)
    expect(decodedTx.type).toBe('0x7e')
    expect(decodedTx.chainId).toBe('0x4cb2f')

    const decodedBlock = decodeBlock(
      storedBlock,
      { full: true, rows: [storedTx] },
      314_159
    )
    expect(decodedBlock.logsBloom).toMatch(/^0x[0-9a-f]{512}$/)
    expect(decodedBlock.transactions[0]).toMatchObject({
      hash: txHash,
      type: '0x7e',
      chainId: '0x4cb2f',
    })

    const decodedReceipt = decodeReceipt(storedTx, storedBlock, [])
    expect(decodedReceipt.logsBloom).toMatch(/^0x[0-9a-f]{512}$/)
    expect(decodedReceipt.type).toBe('0x7e')
  })
})

function transaction(
  overrides: Omit<Partial<ChainTransaction>, 'type'> & {
    type?: ChainTransaction['type'] | Hex
  } = {}
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
    v: 1n,
    r: bytes32('c'),
    s: bytes32('d'),
    accessList: [],
    type: 'eip1559',
    ...overrides,
  } as unknown as ChainTransaction
}

function receipt(overrides: Partial<ChainReceipt>): ChainReceipt {
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

function chainBlock(overrides: Partial<ChainBlock> = {}): ChainBlock {
  return {
    number: 1n,
    hash: bytes32('1'),
    parentHash: bytes32('0'),
    timestamp: 1n,
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
    transactions: [],
    ...overrides,
  } as unknown as ChainBlock
}

function blockRow(number: bigint): EncodedBlock {
  return {
    number,
    hash: bytes32('1'),
    isNullRound: false,
    parentHash: bytes32('0'),
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
