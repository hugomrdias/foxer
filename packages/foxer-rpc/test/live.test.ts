/// <reference types="bun" />

import { expect, mock, test } from 'bun:test'

let finishActiveBlock: () => void = () => undefined
let activeBlockStarted: () => void = () => undefined
let queuedBlocks = 0

mock.module('../src/sync/queue-block.ts', () => ({
  queueBlock: async () => {
    queuedBlocks += 1
    activeBlockStarted()
    await new Promise<void>((resolve) => {
      finishActiveBlock = resolve
    })
  },
}))

const { startLiveSync } = await import('../src/sync/live.ts')

test('stop clears queued blocks and waits for active work', async () => {
  let onBlockNumber: (head: bigint) => void = () => undefined
  let unwatchCalls = 0
  const activeStarted = new Promise<void>((resolve) => {
    activeBlockStarted = resolve
  })

  const sync = startLiveSync({
    logger: { error: () => undefined, info: () => undefined } as never,
    config: {} as never,
    db: {} as never,
    client: {
      watchBlockNumber: (options: {
        onBlockNumber: (head: bigint) => void
      }) => {
        onBlockNumber = options.onBlockNumber
        return () => {
          unwatchCalls += 1
        }
      },
    } as never,
    initialCursor: 1n,
  })

  onBlockNumber(2n)
  await activeStarted

  let stopped = false
  const stop = sync.stop().then(() => {
    stopped = true
  })
  await Promise.resolve()

  expect(unwatchCalls).toBe(1)
  expect(stopped).toBe(false)

  finishActiveBlock()
  await stop

  expect(stopped).toBe(true)
  expect(queuedBlocks).toBe(1)

  await sync.stop()
  expect(unwatchCalls).toBe(1)
})
