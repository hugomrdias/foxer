/// <reference types="bun" />

import { expect, test } from 'bun:test'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { createDatabase } from '../src/db/client.ts'
import { runMigrations } from '../src/db/migrate.ts'
import { schema } from '../src/db/schema/index.ts'
import { hexToBytes } from '../src/utils/hex.ts'

const logger = {
  error: () => undefined,
  info: () => undefined,
} as never

test('getBlockByHash prefers real blocks over null-round placeholders', async () => {
  const directory = await mkdtemp(resolve(tmpdir(), 'foxer-rpc-test-'))
  const dbContext = createDatabase({
    config: { driver: 'pglite', directory },
    logger,
  })

  try {
    await runMigrations({
      dbContext,
      folder: resolve(import.meta.dir, '../drizzle'),
      logger,
    })

    const hash =
      '0x1111111111111111111111111111111111111111111111111111111111111111'
    const parentHash =
      '0x2222222222222222222222222222222222222222222222222222222222222222'
    const emptyRoot =
      '0x56e81f171bcc55a6ff8345e692c0f86e5b48e01b996cadc001622fb5e363b421'

    await dbContext.db.insert(schema.blocks).values([
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
      },
    ])

    const [block] = await dbContext.db.$prepared.getBlockByHash.execute({
      hash: hexToBytes(hash),
    })
    expect(block.number).toBe(10n)
    expect(block.isNullRound).toBe(false)
  } finally {
    await dbContext.stop()
    await rm(directory, { recursive: true, force: true })
  }
})
