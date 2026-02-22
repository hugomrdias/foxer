# Drizzle FEVM Indexer

Reorg-aware FEVM indexer using:

- Drizzle ORM for table definitions and queries
- PGlite for local development
- PostgreSQL for production
- viem for RPC access and event ingestion
- Hono for read APIs
- Drizzle Option 4 migration workflow (generate SQL + apply at runtime)

## Quick start

1. Copy env file:

```bash
cp .env.example .env.local
```

1. Generate SQL migrations from Drizzle schema:

```bash
pnpm --filter drizzle-indexer db:generate
```

1. (Optional) apply migrations manually:

```bash
pnpm --filter drizzle-indexer db:migrate
```

1. Run indexer + API:

```bash
pnpm --filter drizzle-indexer dev
```

API defaults to `http://localhost:4200`.

When app processes start (`dev`, `api`, `indexer`), pending migrations are applied automatically at runtime.

## Runtime modes

- Backfill mode:
  - Uses `getLogs` in batches (`BATCH_SIZE`) from `START_BLOCK` to `head - CONFIRMATION_DEPTH`.
  - Prefetches block headers per batch and skips FEVM null rounds.
  - Runs block-header prefetch and log fetch in parallel per batch.
  - Uses transaction micro-batches (`BACKFILL_DB_BATCH_SIZE`) to reduce DB overhead.
  - Flushes cursor once per transaction micro-batch.
- Live mode:
  - Uses `watchBlockNumber` with `emitMissed: true`.
  - Processes blocks sequentially to avoid false reorg detections.

## Reorg handling

- Before indexing block `N`, the indexer checks whether the chain `parentHash(N)` matches stored `blockHash(N-1)`.
- On mismatch, it rolls back non-canonical rows in `indexed_blocks`.
- Event tables are connected with `ON DELETE CASCADE`, so block rollback deletes dependent events automatically.
- Startup sanity check validates recent indexed blocks (`REORG_CHECK_DEPTH`).

## API endpoints

- `GET /health`
- `GET /events/session-keys?limit=50&cursor=<blockNumber>`
- `GET /events/datasets?limit=50&cursor=<blockNumber>`

## Add a new contract table + hook

1. Add a new table in `src/db/schema`.
2. Add a new stream entry in `src/config/contracts.ts`.
3. Register a hook in `src/hooks/default-hooks.ts`:
   - Decode `log.args`.
   - Insert into the new table.
   - Add idempotency with unique constraints.
4. Run `db:generate` so migration SQL includes your new schema.

## Environment

All env vars are loaded with `dotenv` and validated via `zod` in `src/config/env.ts`.

### Database

- `DB_DRIVER` (default: `pglite`)
  - Supported values: `pglite` or `postgres`.
  - Use `pglite` for local development, `postgres` for production-style deployments.

- `PGLITE_DATA_DIR` (default: `.pglite`)
  - Filesystem path where local PGlite data is stored.
  - Only used when `DB_DRIVER=pglite`.

- `DATABASE_URL` (required when `DB_DRIVER=postgres`)
  - PostgreSQL connection string.
  - Ignored when `DB_DRIVER=pglite`.

### RPC / chain

- `RPC_URL` (default: `https://foc-dev.up.railway.app/ponder/evm/314159`)
  - JSON-RPC endpoint used for backfill and live sync.
  - Point this to your preferred FEVM endpoint.

- `CHAIN_ID` (default: `314159`)
  - EVM chain id used by the viem client.
  - Must match the chain served by `RPC_URL`.

### Logging

- `LOG_LEVEL` (default: `debug` in dev, `info` in production)
  - Controls `pino` log level (`trace`, `debug`, `info`, `warn`, `error`, `fatal`).
  - Useful for reducing noise in production or increasing detail during debugging.

- `NODE_ENV` (default behavior assumes non-production)
  - When `NODE_ENV=production`, logs are emitted as JSON.
  - In non-production, logs use `pino-pretty` for easier local debugging.

### Backfill / sync behavior

- `CONFIRMATION_DEPTH` (default: `30`)
  - Safety lag from head during indexing.
  - Indexer processes up to `head - CONFIRMATION_DEPTH`.
  - Increase for more reorg safety, decrease for lower data latency.

- `BATCH_SIZE` (default: `1000`)
  - Number of block heights per backfill batch.
  - Higher values reduce loop overhead but can stress RPC.

- `BACKFILL_DB_BATCH_SIZE` (default: `250`)
  - Number of blocks processed per DB transaction window during backfill.
  - Higher values reduce transaction overhead and improve throughput.
  - Decrease if you observe long-running transactions or lock contention.

- `START_BLOCK` (default: `0`)
  - Global lower bound for initial backfill start.
  - Effective start is `max(START_BLOCK, min(contract.startBlock))`.

- `REORG_CHECK_DEPTH` (default: `10`)
  - Number of most-recent indexed blocks to verify on startup.
  - Used by startup sanity checks before resuming indexing.

- `RPC_BATCH_SIZE` (default: `100`)
  - Maximum JSON-RPC calls grouped in a single viem transport batch.
  - Increase for better throughput when your RPC endpoint supports batching well.

- `RPC_BATCH_WAIT_MS` (default: `16`)
  - Batch coalescing window in milliseconds for viem HTTP transport.
  - Lower values reduce request latency; higher values increase batching efficiency.

### API

- `API_PORT` (default: `4200`)
  - Port used by the Hono HTTP server.

## Migration strategy (Option 4)

- Source of truth: TypeScript schema files in `src/db/schema`.
- Generate migration files:
  - `pnpm --filter drizzle-indexer db:generate`
- Apply migration files during app runtime:
  - startup runs `src/db/migrate.ts` before serving/indexing.
- Manual apply remains available:
  - `pnpm --filter drizzle-indexer db:migrate`

If you previously used the old `db:bootstrap` flow, clear local PGlite state once (remove `.pglite*`) so migrations can initialize cleanly.


docker run --name postgres-db \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_USER=admin \
  -e POSTGRES_DB=drizzle_indexer \
  -p 5432:5432 \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:17 \
  -c log_statement=all
