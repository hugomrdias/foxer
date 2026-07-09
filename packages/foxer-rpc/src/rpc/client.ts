import {
  createPublicClient,
  type HttpTransport,
  http,
  type PublicClient,
  type Transport,
} from 'viem'

export type RpcClients = {
  backfill: PublicClient<Transport>
  live: PublicClient<Transport>
}

/**
 * Creates separate upstream clients for historical and live work.
 *
 * The backfill client uses the primary RPC URL, while the live client can use a
 * different realtime endpoint and a short polling interval. Keeping them
 * separate allows operators to route heavy historical traffic away from the
 * endpoint used to follow new heads.
 */
export function createRpcClients(options: {
  rpcUrl: string
  realtimeRpcUrl?: string
}): RpcClients {
  const backfillTransport = http(options.rpcUrl) as HttpTransport
  const liveTransport = http(
    options.realtimeRpcUrl ?? options.rpcUrl
  ) as HttpTransport

  return {
    backfill: createPublicClient({ transport: backfillTransport }),
    live: createPublicClient({
      transport: liveTransport,
      pollingInterval: 1000,
    }),
  }
}
