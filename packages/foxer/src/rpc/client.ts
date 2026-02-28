import { createPublicClient, type PublicClient } from 'viem'
import type { ClientConfig } from '../config/config.ts'

export type RpcClients = {
  backfill: PublicClient
  live: PublicClient
}

/**
 * Creates a viem public client configured for the target FEVM chain.
 */
export function createRpcClients(options: ClientConfig): RpcClients {
  const backfill = createPublicClient(options)

  const liveTransport = options.realtimeTransport ?? options.transport

  const live = createPublicClient({
    chain: options.chain,
    transport: liveTransport,
    pollingInterval: 1000,
  })

  return {
    backfill,
    live,
  }
}
