import {
  createConfig,
  DataFinalityStateFinalized,
  DataFinalityStateRealtime,
  DataFinalityStateUnfinalized,
  DataFinalityStateUnknown,
} from '@erpc-cloud/config'

export default createConfig({
  logLevel: 'info',
  server: {
    httpHostV4: '0.0.0.0',
    httpHostV6: '::',
    httpPort: 4000,
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
        },
      ],
      upstreams: [
        {
          id: 'chainlove-realtime',
          endpoint: `https://filecoin.chain.love/load-balancer?token=${process.env.RPC_REALTIME_TOKEN}`,
          evm: {
            chainId: 314159,
          },
        },
        {
          id: 'chainlove-public',
          endpoint: `https://api.calibration.node.glif.io/rpc/v1`,
          evm: {
            chainId: 314159,
          },
        },
        {
          id: 'ankr-public',
          endpoint: `https://rpc.ankr.com/filecoin_testnet`,
          rateLimitBudget: 'ankr',
          evm: {
            chainId: 314159,
          },
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
