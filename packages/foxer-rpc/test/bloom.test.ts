/// <reference types="bun" />

import { expect, test } from 'bun:test'

import { createLogsBloom, zeroLogsBloom } from '../src/utils/bloom.ts'

test('zeroLogsBloom is a valid empty 256-byte bloom', () => {
  expect(zeroLogsBloom).toMatch(/^0x[0-9a-f]{512}$/)
  expect(zeroLogsBloom).toBe(createLogsBloom([]))
})

test('createLogsBloom sets three bits for one value', () => {
  const bloom = createLogsBloom(['0x1111111111111111111111111111111111111111'])
  const bytes = Buffer.from(bloom.slice(2), 'hex')
  let bits = 0

  for (const byte of bytes) {
    bits += byte.toString(2).replaceAll('0', '').length
  }

  expect(bits).toBe(3)
})
