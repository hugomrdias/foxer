import { setTimeout } from 'node:timers/promises'

import { Client } from 'pg'

import type { Logger } from '../utils/logger.ts'

const SYNC_LEASE_KEY = 0x666f786572727063n
const DEFAULT_RETRY_DELAY_MS = 1_000

export type SyncLease = {
  release: () => Promise<void>
}

/**
 * Acquires the singleton sync lease on a dedicated PostgreSQL session.
 *
 * Railway briefly overlaps old and new deployments during a rollout. Keeping
 * this session-level advisory lock for the full sync lifecycle makes the new
 * process wait until the previous writer disconnects before it reads a cursor.
 */
export async function acquireSyncLease({
  databaseUrl,
  logger,
  signal,
  onLost,
  retryDelayMs = DEFAULT_RETRY_DELAY_MS,
}: {
  databaseUrl: string
  logger: Logger
  signal?: AbortSignal
  onLost: (error: Error) => void
  retryDelayMs?: number
}): Promise<SyncLease> {
  const client = new Client({
    application_name: 'foxer-rpc-sync-lease',
    connectionString: databaseUrl,
    connectionTimeoutMillis: 5_000,
  })
  let acquired = false
  let connected = false
  let lost = false
  let releasing = false
  let released = false

  const handleConnectionError = (error: Error) => {
    if (acquired && !releasing && !lost) {
      lost = true
      onLost(error)
    }
  }
  client.on('error', handleConnectionError)

  try {
    signal?.throwIfAborted()
    await client.connect()
    connected = true

    let waitingLogged = false
    while (true) {
      signal?.throwIfAborted()
      const result = await client.query<{ acquired: boolean }>(
        'SELECT pg_try_advisory_lock($1::bigint) AS acquired',
        [SYNC_LEASE_KEY.toString()]
      )
      acquired = result.rows[0]?.acquired === true

      if (acquired) {
        try {
          signal?.throwIfAborted()
        } catch (error) {
          await client.query('SELECT pg_advisory_unlock($1::bigint)', [
            SYNC_LEASE_KEY.toString(),
          ])
          acquired = false
          throw error
        }

        logger.info('sync lease acquired')
        break
      }

      if (!waitingLogged) {
        logger.info('waiting for existing sync writer to release its lease')
        waitingLogged = true
      }
      await setTimeout(retryDelayMs, undefined, { signal })
    }
  } catch (error) {
    releasing = true
    if (connected) await client.end().catch(() => undefined)
    client.off('error', handleConnectionError)
    throw error
  }

  return {
    async release() {
      if (released) return
      released = true
      releasing = true

      try {
        if (acquired) {
          await client.query('SELECT pg_advisory_unlock($1::bigint)', [
            SYNC_LEASE_KEY.toString(),
          ])
          acquired = false
        }
      } finally {
        await client.end()
        client.off('error', handleConnectionError)
      }

      logger.info('sync lease released')
    },
  }
}
