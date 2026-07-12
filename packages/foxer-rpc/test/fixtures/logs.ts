import type { Database } from '../../src/db/client.ts'
import { schema } from '../../src/db/schema/index.ts'
import { address, bytes32 } from '../helpers.ts'
import {
  block1,
  block2,
  blockRow,
  transactionRow,
  tx1,
  tx2,
} from './receipts.ts'

export { block1, block2, tx1, tx2 }

export const address1 = address('1')
export const address2 = address('2')
export const topic1 = bytes32('3')
export const topic2 = bytes32('4')
export const topic3 = bytes32('5')

export async function seedLogs(db: Database) {
  await db
    .insert(schema.blocks)
    .values([blockRow(1n, block1, bytes32('0')), blockRow(2n, block2, block1)])
  await db
    .insert(schema.transactions)
    .values([transactionRow(1n, 0, tx1), transactionRow(2n, 0, tx2)])
  await db.insert(schema.logs).values([
    {
      blockNumber: 1n,
      logIndex: 0,
      transactionIndex: 0,
      address: address1,
      topic0: topic1,
      topic1: null,
      topic2: null,
      topic3: null,
      data: '0x',
    },
    {
      blockNumber: 1n,
      logIndex: 1,
      transactionIndex: 0,
      address: address2,
      topic0: topic1,
      topic1: topic2,
      topic2: null,
      topic3: null,
      data: '0x1234',
    },
    {
      blockNumber: 2n,
      logIndex: 0,
      transactionIndex: 0,
      address: address1,
      topic0: topic3,
      topic1: null,
      topic2: null,
      topic3: null,
      data: '0x',
    },
  ])
}
