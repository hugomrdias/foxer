import {
  createPublicClient,
  http,
  type PublicClient,
  type Transport,
} from 'viem'

export type RpcClients = {
  backfill: PublicClient<Transport>
  live: PublicClient<Transport>
  proxy: PublicClient<Transport>
}

export const PROXY_REQUEST_TIMEOUT_MS = 10_000
export const PROXY_MAX_RESPONSE_BODY_SIZE = 10 * 1024 * 1024

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
  const backfillTransport = http(options.rpcUrl, {
    fetchOptions: { headers: { 'Accept-Encoding': 'zstd, gzip' } },
    timeout: 120000,
    maxResponseBodySize: false,
    // onFetchRequest: async (request) => {
    // console.log(
    //   'request',
    //   request.url,
    //   request.headers,
    //   await request.clone().json()
    // )
    // },
    // onFetchResponse: async (response) => {
    // console.log(
    //   'response',
    //   response.url,
    //   response.headers,
    //   (await response.clone().arrayBuffer()).byteLength
    // )
    // },
  })
  const liveTransport = http(options.realtimeRpcUrl ?? options.rpcUrl, {
    fetchOptions: { headers: { 'Accept-Encoding': 'zstd, gzip' } },
  })
  const proxyTransport = http(options.realtimeRpcUrl ?? options.rpcUrl, {
    fetchOptions: { headers: { 'Accept-Encoding': 'zstd, gzip' } },
    timeout: PROXY_REQUEST_TIMEOUT_MS,
    retryCount: 0,
    maxResponseBodySize: PROXY_MAX_RESPONSE_BODY_SIZE,
  })

  return {
    backfill: createPublicClient({ transport: backfillTransport }),
    live: createPublicClient({
      transport: liveTransport,
      pollingInterval: 1000,
    }),
    proxy: createPublicClient({ transport: proxyTransport }),
  }
}
