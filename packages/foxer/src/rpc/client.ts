import { createPublicClient, http } from 'viem'
import { filecoinCalibration } from 'viem/chains'

import { env } from '../config/env.ts'

/**
 * Creates a viem public client configured for the target FEVM chain.
 */
export function createRpcClient() {
  return createPublicClient({
    chain: {
      ...filecoinCalibration,
      id: env.CHAIN_ID,
      rpcUrls: {
        default: { http: [env.RPC_URL] },
        public: { http: [env.RPC_URL] },
      },
    },
    transport: http(env.RPC_URL, {
      batch: true,
      // batch: {
      //   batchSize: env.RPC_BATCH_SIZE,
      //   wait: env.RPC_BATCH_WAIT_MS,
      // },
    }),
  })
}
