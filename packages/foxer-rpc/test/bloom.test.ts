import { expect, test } from 'bun:test'

import { zeroLogsBloom } from '../src/utils/bloom.ts'

test('zeroLogsBloom is a valid empty 256-byte bloom', () => {
  expect(zeroLogsBloom).toMatch(/^0x[0-9a-f]{512}$/)
})
