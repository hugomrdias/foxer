import {
  createConfig,
  DataFinalityStateFinalized,
  DataFinalityStateRealtime,
  DataFinalityStateUnfinalized,
  DataFinalityStateUnknown,
  type Duration,
  type FailsafeConfig,
} from '@erpc-cloud/config'

/** Adaptive timeout spec — runtime accepts this shape; TS Duration is string-only. */
const adaptiveTimeout = (spec: {
  quantile: number
  base: string
  min: string
  max: string
}) => ({ duration: spec as unknown as Duration })

const staticTimeout = (duration: string) => ({
  duration: duration as Duration,
})

const liveUpstreamFailsafe: FailsafeConfig[] = [
  {
    matchMethod:
      'eth_blockNumber|eth_gasPrice|eth_getBalance|eth_chainId|eth_maxPriorityFeePerGas|eth_getTransactionCount',
    timeout: adaptiveTimeout({
      quantile: 0.8,
      base: '500ms',
      min: '200ms',
      max: '2s',
    }),
  },
  {
    matchMethod: 'eth_getLogs|eth_getBlockReceipts|eth_call',
    timeout: adaptiveTimeout({
      quantile: 0.9,
      base: '10s',
      min: '2s',
      max: '15s',
    }),
  },
  {
    matchMethod: 'eth_get*',
    timeout: adaptiveTimeout({
      quantile: 0.9,
      base: '5s',
      min: '500ms',
      max: '8s',
    }),
  },
  {
    matchMethod: '*',
    timeout: adaptiveTimeout({
      quantile: 0.8,
      base: '15s',
      min: '2s',
      max: '20s',
    }),
  },
]

const liveNetworkFailsafe: FailsafeConfig[] = [
  {
    matchMethod:
      'eth_blockNumber|eth_gasPrice|eth_getBalance|eth_chainId|eth_maxPriorityFeePerGas',
    matchFinality: [DataFinalityStateRealtime, DataFinalityStateUnfinalized],
    timeout: adaptiveTimeout({
      quantile: 0.99,
      base: '3s',
      min: '2s',
      max: '5s',
    }),
  },
  {
    matchMethod: 'eth_call|eth_getLogs',
    matchFinality: [DataFinalityStateRealtime, DataFinalityStateUnfinalized],
    timeout: adaptiveTimeout({
      quantile: 0.99,
      base: '20s',
      min: '15s',
      max: '30s',
    }),
  },
  {
    matchMethod: '*',
    matchFinality: [DataFinalityStateRealtime, DataFinalityStateUnfinalized],
    timeout: adaptiveTimeout({
      quantile: 0.99,
      base: '10s',
      min: '6s',
      max: '15s',
    }),
  },
  {
    matchMethod: '*',
    matchFinality: [DataFinalityStateFinalized, DataFinalityStateUnknown],
    timeout: adaptiveTimeout({
      quantile: 0.99,
      base: '8s',
      min: '5s',
      max: '12s',
    }),
  },
]

const archiveNetworkFailsafe: FailsafeConfig[] = [
  {
    // Large archive payloads (e.g. eth_getBlockReceipts ~6MB) can exceed 60s upstream.
    matchMethod:
      'eth_getLogs|eth_getBlockReceipts|eth_getBlockByNumber|eth_call',
    matchFinality: [DataFinalityStateFinalized, DataFinalityStateUnknown],
    timeout: staticTimeout('150s'),
  },
  {
    matchMethod: 'eth_getLogs|eth_call',
    matchFinality: [DataFinalityStateRealtime, DataFinalityStateUnfinalized],
    timeout: adaptiveTimeout({
      quantile: 0.99,
      base: '90s',
      min: '30s',
      max: '120s',
    }),
  },
  {
    matchMethod: '*',
    matchFinality: [DataFinalityStateFinalized, DataFinalityStateUnknown],
    timeout: adaptiveTimeout({
      quantile: 0.99,
      base: '60s',
      min: '15s',
      max: '90s',
    }),
  },
  {
    matchMethod: '*',
    matchFinality: [DataFinalityStateRealtime, DataFinalityStateUnfinalized],
    timeout: adaptiveTimeout({
      quantile: 0.99,
      base: '45s',
      min: '10s',
      max: '60s',
    }),
  },
]

const archiveUpstreamFailsafe: FailsafeConfig[] = [
  {
    matchMethod: 'eth_getLogs|eth_getBlockReceipts|eth_getBlockByNumber',
    timeout: staticTimeout('140s'),
  },
  {
    matchMethod: 'eth_call',
    timeout: adaptiveTimeout({
      quantile: 0.9,
      base: '60s',
      min: '10s',
      max: '90s',
    }),
  },
  {
    matchMethod: 'eth_get*',
    timeout: adaptiveTimeout({
      quantile: 0.9,
      base: '30s',
      min: '5s',
      max: '60s',
    }),
  },
  {
    matchMethod: '*',
    timeout: adaptiveTimeout({
      quantile: 0.8,
      base: '60s',
      min: '10s',
      max: '90s',
    }),
  },
]

export default createConfig({
  logLevel: 'info',
  server: {
    httpHostV4: '0.0.0.0',
    httpHostV6: '::',
    httpPort: 4000,
    enableGzip: true,
    // Archive heavy methods use up to 150s network / 140s upstream; live stays tight.
    maxTimeout: '180s',

    // waitAfterShutdown: '30s',
    // waitBeforeShutdown: '30s',
  },
  healthCheck: {
    mode: 'verbose',
  },
  projects: [
    {
      id: 'live',
      cors: {
        // List of allowed origins. Use ["*"] to allow any origin
        allowedOrigins: ['*'],
        // HTTP methods allowed for CORS requests
        allowedMethods: ['GET', 'POST', 'OPTIONS'],
        // Headers allowed in actual requests
        allowedHeaders: ['Content-Type', 'Authorization'],
        // Headers exposed to the browser
        exposedHeaders: ['X-Request-ID'],
        // Whether the browser should include credentials with requests
        allowCredentials: true,
        // How long (in seconds) browsers should cache preflight request results
        maxAge: 3600,
      },
      networks: [
        {
          architecture: 'evm',
          directiveDefaults: {
            validateTransactionsRoot: false,
          },
          evm: {
            chainId: 314159,
          },
          failsafe: liveNetworkFailsafe,
        },
      ],
      upstreams: [
        {
          id: 'chainlove-realtime',
          endpoint: `https://filecoin.chain.love/load-balancer?token=${process.env.RPC_REALTIME_TOKEN}`,
          evm: {
            chainId: 314159,
          },
          failsafe: liveUpstreamFailsafe,
        },
        {
          id: 'chainlove-public',
          endpoint: `https://api.calibration.node.glif.io/rpc/v1`,
          evm: {
            chainId: 314159,
          },
          failsafe: liveUpstreamFailsafe,
        },
        {
          id: 'ankr-public',
          endpoint: `https://rpc.ankr.com/filecoin_testnet`,
          rateLimitBudget: 'ankr',
          evm: {
            chainId: 314159,
          },
          failsafe: liveUpstreamFailsafe,
        },
      ],
    },
    {
      id: 'archive',
      cors: {
        // List of allowed origins. Use ["*"] to allow any origin
        allowedOrigins: ['*'],
        // HTTP methods allowed for CORS requests
        allowedMethods: ['GET', 'POST', 'OPTIONS'],
        // Headers allowed in actual requests
        allowedHeaders: ['Content-Type', 'Authorization'],
        // Headers exposed to the browser
        exposedHeaders: ['X-Request-ID'],
        // Whether the browser should include credentials with requests
        allowCredentials: true,
        // How long (in seconds) browsers should cache preflight request results
        maxAge: 3600,
      },
      networks: [
        {
          architecture: 'evm',
          directiveDefaults: {
            validateTransactionsRoot: false,
          },
          evm: {
            chainId: 314159,
          },
          failsafe: archiveNetworkFailsafe,
        },
      ],
      upstreams: [
        {
          id: 'chainlove-archive',
          endpoint: `https://calibration.node.glif.io/archive/lotus/rpc/v1?token=${process.env.RPC_ARCHIVE_TOKEN}`,
          evm: {
            chainId: 314159,
            nodeType: 'archive',
          },
          failsafe: archiveUpstreamFailsafe,
        },
      ],
    },
  ],

  rateLimiters: {
    budgets: [
      {
        id: 'ankr',
        rules: [
          {
            method: '*',
            maxCount: 1000,
            period: 1,
          },
        ],
      },
    ],
  },
  database: {
    evmJsonRpcCache: {
      connectors: [
        {
          id: 'memory-cache',
          driver: 'memory',
          memory: {
            maxItems: 10000,
            maxTotalSize: '1GB',
            // For debugging purposes, you can enable metrics collection (expect 10% performance hit)
            emitMetrics: false,
          },
        },
        {
          id: 'postgres-cache',
          driver: 'postgresql',
          postgresql: {
            connectionUri: process.env.DATABASE_URL ?? '',
            table: 'rpc_cache',
            initTimeout: '5s',
            getTimeout: '1s',
            setTimeout: '2s',
          },
        },
      ],
      policies: [
        {
          network: '*',
          method: '*',
          finality: DataFinalityStateFinalized,
          connector: 'postgres-cache',
          ttl: 0,
        },
        {
          network: '*',
          method: '*',
          finality: DataFinalityStateUnfinalized,
          connector: 'memory-cache',
          ttl: '10s',
        },
        {
          network: '*',
          method: '*',
          finality: DataFinalityStateRealtime,
          connector: 'memory-cache',
          ttl: '5s',
        },
        {
          network: '*',
          method: '*',
          finality: DataFinalityStateUnknown,
          connector: 'memory-cache',
          ttl: '30s',
        },
      ],
    },
  },
})
