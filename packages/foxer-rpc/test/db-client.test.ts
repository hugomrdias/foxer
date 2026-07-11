import { expect, test } from 'bun:test'
import type { Pool } from 'pg'

import { createDatabase, POSTGRES_POOL_MAX_SYNC } from '../src/db/client.ts'
import { schema } from '../src/db/schema/index.ts'
import { zeroLogsBloom } from '../src/utils/bloom.ts'
import { hexToBytes } from '../src/utils/hex.ts'
import { withTestDatabase } from './helpers.ts'

const logger = {
  error: () => undefined,
  info: () => undefined,
} as never

const invalidPostgresUrl = 'postgres://invalid:invalid@127.0.0.1:1/invalid'

test('postgres api pool uses the configured maximum', async () => {
  const dbContext = createDatabase({
    databaseUrl: invalidPostgresUrl,
    logger,
    maxConnections: 12,
  })

  try {
    const pool = dbContext.db.$client as Pool
    expect(pool.options.max).toBe(12)
    expect(pool.options.application_name).toBe('foxer-rpc-api')
  } finally {
    await dbContext.stop()
  }
})

test('postgres sync pool uses static sizing', async () => {
  const dbContext = createDatabase({
    databaseUrl: invalidPostgresUrl,
    logger,
    role: 'sync',
  })

  try {
    const pool = dbContext.db.$client as Pool
    expect(pool.options.max).toBe(POSTGRES_POOL_MAX_SYNC)
    expect(pool.options.application_name).toBe('foxer-rpc-sync')
  } finally {
    await dbContext.stop()
  }
})

test('getBlockByHash prefers real blocks over null-round placeholders', async () => {
  await withTestDatabase(async (db) => {
    const hash =
      '0x1111111111111111111111111111111111111111111111111111111111111111'
    const parentHash =
      '0x2222222222222222222222222222222222222222222222222222222222222222'
    const emptyRoot =
      '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'

    await db.insert(schema.blocks).values([
      {
        number: 11n,
        hash,
        isNullRound: true,
        parentHash: hash,
        timestamp: 11n,
        miner: '0x0000000000000000000000000000000000000000',
        gasUsed: 0n,
        gasLimit: 30_000_000n,
        baseFeePerGas: 1_000_000_000n,
        size: 0n,
        stateRoot: emptyRoot,
        receiptsRoot: emptyRoot,
        transactionsRoot: emptyRoot,
        extraData: '0x',
        logsBloom: zeroLogsBloom,
      },
      {
        number: 10n,
        hash,
        isNullRound: false,
        parentHash,
        timestamp: 10n,
        miner: '0x0000000000000000000000000000000000000000',
        gasUsed: 1n,
        gasLimit: 30_000_000n,
        baseFeePerGas: 1_000_000_000n,
        size: 1n,
        stateRoot: emptyRoot,
        receiptsRoot: emptyRoot,
        transactionsRoot: emptyRoot,
        extraData: '0x',
        logsBloom: zeroLogsBloom,
      },
    ])

    const [block] = await db.$prepared.getBlockByHash.execute({
      hash: hexToBytes(hash),
    })
    expect(block.number).toBe(10n)
    expect(block.isNullRound).toBe(false)
  })
})
