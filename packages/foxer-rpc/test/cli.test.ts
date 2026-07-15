import { expect, test } from 'bun:test'
import { fileURLToPath } from 'node:url'

test('registers the API-only serve command', async () => {
  const entrypoint = fileURLToPath(
    new URL('../src/bin/index.ts', import.meta.url)
  )
  const child = Bun.spawn([process.execPath, entrypoint, '--help'], {
    stderr: 'pipe',
    stdout: 'pipe',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  expect(exitCode).toBe(0)
  expect(stderr).toBe('')
  expect(stdout).toContain(
    'serve        Serve the production JSON-RPC API without sync'
  )
})

test('dev exposes only PostgreSQL database configuration', async () => {
  const entrypoint = fileURLToPath(
    new URL('../src/bin/index.ts', import.meta.url)
  )
  const child = Bun.spawn([process.execPath, entrypoint, 'dev', '--help'], {
    stderr: 'pipe',
    stdout: 'pipe',
  })

  const [exitCode, stdout, stderr] = await Promise.all([
    child.exited,
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
  ])

  expect(exitCode).toBe(0)
  expect(stderr).toBe('')
  expect(stdout).toContain('--database-url')
  expect(stdout).toContain('--backfill-concurrency')
  expect(stdout).not.toContain('--backfill-memory-limit-mb')
  expect(stdout).not.toContain('--batch-size')
  expect(stdout).not.toContain('--backfill-fetch-concurrency')
  expect(stdout).not.toContain('--backfill-copy-chunk-bytes')
  expect(stdout).not.toContain('--dir')
})
