# foxer-rpc

`foxer-rpc` is a standalone full-chain sync service for Filecoin/FEVM-style Ethereum JSON-RPC chains.

It syncs canonical chain data into a small Postgres-compatible database schema and exposes a minimal Ethereum JSON-RPC API backed by that database. It is intentionally simpler than `@hugomrdias/foxer`: there are no contract configs, hooks, custom indexers, user schemas, SQL-over-HTTP endpoints, or config files.

## What It Does

`foxer-rpc` has two jobs:

1. Sync chain data from an upstream Ethereum JSON-RPC node.
2. Serve basic JSON-RPC methods from the local database.

The service stores:

- `blocks`
- `transactions`
- `logs`

Receipt fields are stored on the `transactions` row, and receipt logs are stored in `logs`. There is no separate `receipts` table.

Unsupported Ethereum RPC methods return JSON-RPC error `-32601`. The service does not proxy unknown calls to the upstream node.

## How It Works

```mermaid
flowchart LR
  upstream["Upstream JSON-RPC node"]
  sync["foxer-rpc sync engine"]
  db["Postgres or PGlite"]
  api["Hono JSON-RPC API"]
  client["RPC client"]

  upstream -->|"eth_getBlockByNumber"| sync
  upstream -->|"eth_getBlockReceipts"| sync
  sync --> db
  client -->|"POST /"| api
  api --> db
```

At startup, `foxer-rpc`:

1. Reads configuration from CLI flags and environment variables.
2. Connects to the upstream RPC node with `viem`.
3. Reads the upstream `chainId`.
4. Opens Postgres or PGlite.
5. Applies the shipped Drizzle migrations from `packages/foxer-rpc/drizzle`.
6. Verifies recently indexed blocks against the upstream chain to detect reorgs.
7. Backfills historical blocks up to `head - finality`.
8. Starts live sync with `watchBlockNumber`.
9. Starts the Hono JSON-RPC API.

During sync, each block is fetched with transactions included. Receipts are fetched once per block with `eth_getBlockReceipts`, and log rows are derived from those receipts. This avoids one RPC call per transaction.

## Storage Model

The schema is optimized for small disk usage and fast API reads:

- Hashes, addresses, and topics are stored as `bytea`, not hex text.
- Most numeric fields are stored as `bigint`.
- `transactions.value` is stored as `numeric(78,0)` because attoFIL values can exceed signed 64-bit integer range.
- Receipt fields such as `status`, `receiptGasUsed`, `cumulativeGasUsed`, `effectiveGasPrice`, and `contractAddress` are stored on `transactions`.
- `logsBloom` is not stored. It is recomputed from logs when returning blocks or receipts.
- Log rows do not duplicate `blockHash` or `transactionHash`; those are recovered by joining through `blockNumber` and `transactionIndex`.

Important indexes:

- `blocks.number` primary key
- `blocks.hash` normal index
- `transactions.hash` primary key
- `transactions(blockNumber, transactionIndex)` unique index
- `logs(blockNumber, logIndex)` primary key
- `logs(address, blockNumber)`
- `logs(topic0, blockNumber)`

`blocks.hash` is intentionally not unique because Filecoin null rounds are represented as placeholder rows that reuse the previous real block hash.

## Reorg Handling

`foxer-rpc` treats the chain as the source of truth.

On startup, it checks the last `FINALITY` indexed blocks against the upstream node. If a hash mismatch is found, it deletes canonical data from the first mismatched block onward.

During live sync, each incoming block is checked against the stored parent block. If parent continuity breaks, `foxer-rpc` walks backward until it finds a common ancestor, deletes rows after that point, clears queued live work, and resumes from the rewind point.

Deletes happen in dependency order:

1. `logs`
2. `transactions`
3. `blocks`

## JSON-RPC API

The HTTP server listens on `POST /` and accepts JSON-RPC 2.0 single requests and batches.

Implemented methods:

- `eth_chainId`
- `net_version`
- `web3_clientVersion`
- `eth_blockNumber`
- `eth_getBlockByNumber`
- `eth_getBlockByHash`
- `eth_getTransactionByHash`
- `eth_getTransactionByBlockNumberAndIndex`
- `eth_getTransactionByBlockHashAndIndex`
- `eth_getBlockTransactionCountByNumber`
- `eth_getBlockTransactionCountByHash`
- `eth_getTransactionReceipt`
- `eth_getBlockReceipts`
- `eth_getLogs`

Health check:

```bash
curl http://127.0.0.1:8545/health
```

Example JSON-RPC request:

```bash
curl http://127.0.0.1:8545 \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

`eth_getLogs` is capped by both block range and result row count to protect the database from unbounded scans.

## Compression

Responses are compressed with `hono-compress`.

Supported response encodings:

- `zstd`
- `gzip`
- `deflate`

Compression is skipped for small responses below the middleware threshold. Large `eth_getLogs` responses and full block responses benefit the most.

`zstd` requires Node.js support for native zstd compression, so this package declares `node >= 22.15`.

## Configuration

Configuration is read from CLI flags and environment variables. CLI flags override environment variables.

| Env var | Flag | Default | Description |
| --- | --- | --- | --- |
| `RPC_URL` | `--rpc-url` | Required | Upstream Ethereum JSON-RPC URL |
| `REALTIME_RPC_URL` | `--realtime-rpc-url` | `RPC_URL` | Optional upstream RPC URL for live polling |
| `DATABASE_URL` | `--database-url` | None | Postgres connection URL |
| `START_BLOCK` | `--start-block` | `0` | First block to sync when the DB is empty |
| `FINALITY` | `--finality` | `30` | Blocks to leave behind the chain head during backfill |
| `BATCH_SIZE` | `--batch-size` | `100` | Blocks fetched per backfill batch |
| `PORT` | `--port` | `8545` | JSON-RPC server port |
| `LOG_LEVEL` | `--log-level` | `info` | Pino log level |
| `MAX_LOGS_BLOCK_RANGE` | `--max-logs-block-range` | `10000` | Maximum block range for `eth_getLogs` |
| `MAX_LOGS_RESULT_ROWS` | `--max-logs-result-rows` | `10000` | Maximum rows returned by `eth_getLogs` |

Development mode also accepts:

| Flag | Default | Description |
| --- | --- | --- |
| `--dir` | `.pglite` | PGlite data directory |

## Install

From this monorepo:

```bash
bun install
bun --filter @hugomrdias/foxer-rpc build
```

When published:

```bash
npm install -g @hugomrdias/foxer-rpc viem hono
```

The CLI binary is:

```bash
foxer-rpc
```

Inside this repository, use the source binary:

```bash
bun run packages/foxer-rpc/src/bin/index.ts
```

or from the package directory:

```bash
cd packages/foxer-rpc
bun run src/bin/index.ts
```

## Run Manually With PGlite

PGlite is best for local development and quick smoke tests. It stores the database in a local directory and does not require a separate Postgres server.

```bash
cd packages/foxer-rpc

RPC_URL='https://api.calibration.node.glif.io/rpc/v1' \
START_BLOCK=3140755 \
PORT=8545 \
bun run src/bin/index.ts dev \
  --dir .pglite \
  --start-block 3140755 \
  --port 8545
```

Then query the local endpoint:

```bash
curl http://127.0.0.1:8545 \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

Fetch a block:

```bash
curl http://127.0.0.1:8545 \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":2,"method":"eth_getBlockByNumber","params":["latest",false]}'
```

Fetch logs:

```bash
curl http://127.0.0.1:8545 \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":3,"method":"eth_getLogs","params":[{"fromBlock":"0x2feba3","toBlock":"0x2febac"}]}'
```

Stop the process with `Ctrl+C`.

## Run Manually With Postgres

Postgres is recommended for production and larger backfills.

Start a local Postgres:

```bash
docker run --rm \
  --name foxer-rpc-postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=foxer_rpc \
  -p 5432:5432 \
  -v foxer-rpc-postgres:/var/lib/postgresql/data \
  postgres:17
```

In another terminal:

```bash
cd packages/foxer-rpc

RPC_URL='https://api.calibration.node.glif.io/rpc/v1' \
DATABASE_URL='postgres://postgres:postgres@127.0.0.1:5432/foxer_rpc' \
START_BLOCK=3140755 \
PORT=8545 \
bun run src/bin/index.ts start
```

The `start` command:

- requires `DATABASE_URL`
- uses JSON logs
- runs migrations automatically
- starts the sync engine and JSON-RPC server

## Recommended Production Settings

For a dedicated Postgres instance on SSD/NVMe, start with conservative defaults and tune from metrics:

```conf
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
work_mem = 8MB
checkpoint_timeout = 15min
checkpoint_completion_target = 0.9
max_wal_size = 4GB
min_wal_size = 1GB
random_page_cost = 1.1
effective_io_concurrency = 200
```

For faster ingest when the chain can be replayed after a crash:

```conf
synchronous_commit = off
wal_compression = on
```

Keep `synchronous_commit = on` if every acknowledged write must be durable.

Unlike `foxer`, `foxer-rpc` does not require `wal_level = logical` because it does not create logical replication publications.

## Docker

There is no application config file to copy into the image. A Docker image only needs the package source, dependencies, built output, and shipped migrations.

### Build an Image From the Monorepo

From the repository root, create a Dockerfile for `foxer-rpc`:

```Dockerfile
# syntax=docker/dockerfile:1

FROM oven/bun:1.3-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json bun.lock tsconfig.json ./
COPY packages/foxer-rpc packages/foxer-rpc
RUN bun install
WORKDIR /app/packages/foxer-rpc
RUN bun run build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8545
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 foxer-rpc

COPY --from=deps /app /app

EXPOSE 8545
USER foxer-rpc
WORKDIR /app/packages/foxer-rpc

CMD ["bun", "run", "dist/bin/index.js", "start"]
```

Save it as `packages/foxer-rpc/Dockerfile`, then build:

```bash
docker build \
  -t foxer-rpc:local \
  -f packages/foxer-rpc/Dockerfile \
  .
```

### Run With Docker And PGlite

PGlite works in Docker for testing, but it is not recommended for production.

```bash
docker volume create foxer-rpc-pglite

docker run --rm \
  --name foxer-rpc \
  -p 8545:8545 \
  -e RPC_URL='https://api.calibration.node.glif.io/rpc/v1' \
  -e START_BLOCK=3140755 \
  -e PORT=8545 \
  -v foxer-rpc-pglite:/app/packages/foxer-rpc/.pglite \
  foxer-rpc:local \
  bun run dist/bin/index.js dev --dir .pglite
```

### Run With Docker And Postgres

Create a network:

```bash
docker network create foxer-rpc
```

Start Postgres:

```bash
docker run -d \
  --name foxer-rpc-postgres \
  --network foxer-rpc \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=foxer_rpc \
  -v foxer-rpc-postgres:/var/lib/postgresql/data \
  postgres:17
```

Start `foxer-rpc`:

```bash
docker run --rm \
  --name foxer-rpc \
  --network foxer-rpc \
  -p 8545:8545 \
  -e RPC_URL='https://api.calibration.node.glif.io/rpc/v1' \
  -e DATABASE_URL='postgres://postgres:postgres@foxer-rpc-postgres:5432/foxer_rpc' \
  -e START_BLOCK=3140755 \
  -e PORT=8545 \
  -e LOG_LEVEL=info \
  foxer-rpc:local
```

Query it from the host:

```bash
curl http://127.0.0.1:8545 \
  -H 'content-type: application/json' \
  --data '{"jsonrpc":"2.0","id":1,"method":"eth_blockNumber","params":[]}'
```

Stop the containers:

```bash
docker stop foxer-rpc
docker stop foxer-rpc-postgres
```

Remove data volumes when you no longer need them:

```bash
docker volume rm foxer-rpc-postgres foxer-rpc-pglite
```

## Docker Compose Example

```yaml
services:
  postgres:
    image: postgres:17
    environment:
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
      POSTGRES_DB: foxer_rpc
    volumes:
      - postgres-data:/var/lib/postgresql/data

  foxer-rpc:
    image: foxer-rpc:local
    depends_on:
      - postgres
    ports:
      - "8545:8545"
    environment:
      RPC_URL: "https://api.calibration.node.glif.io/rpc/v1"
      DATABASE_URL: "postgres://postgres:postgres@postgres:5432/foxer_rpc"
      START_BLOCK: "3140755"
      PORT: "8545"
      LOG_LEVEL: "info"

volumes:
  postgres-data:
```

Build the image first, then run:

```bash
docker compose up
```

## Operational Notes

- Pick a `START_BLOCK` close to the earliest block you need. Full-chain sync from genesis can be very large.
- For production, use Postgres and a reliable upstream archive RPC.
- Use `REALTIME_RPC_URL` if you want live polling to hit a different upstream endpoint than backfill.
- Set `FINALITY` high enough for the chain and upstream RPC behavior you trust.
- Keep `MAX_LOGS_BLOCK_RANGE` and `MAX_LOGS_RESULT_ROWS` bounded if the endpoint is exposed to untrusted clients.
- If a deployment crashes, restart it. The cursor is derived from the latest stored block, and recent blocks are verified on startup.
