# API example

This example shows how to build a `foxer` indexing service for Filecoin Calibration with a typed schema, hooks, and Hono API.

## What it does

- defines a `foxer.config.ts` with Calibration contracts and event hooks
- runs the `foxer` dev runtime
- exposes the SQL API used by the companion app example

## Setup

Copy the example environment file and fill in the RPC endpoints:

```bash
cp .env.example .env.local
```

Required variables:

- `RPC_URL`
- `RPC_LIVE_URL`

Optional variables:

- `DATABASE_URL` to use Postgres instead of the default embedded PGlite database
- `LOG_LEVEL`
- `PORT`

## Run

```bash
bun run generate
bun run build
bun run dev
```

Useful extras:

```bash
bun run check
bunx drizzle-kit studio
```

The API listens on port `4200` by default, and the SQL endpoint is available at `http://localhost:4200/sql`.

## Database notes

If `DATABASE_URL` is not set, `foxer` uses a local PGlite database stored in `.pglite`.

To run Postgres locally instead, start a container like this and set `DATABASE_URL` from `.env.local`:

```bash
docker run --rm -it \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=foxer \
  -p 5432:5432 \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:17 -c wal_level=logical
```
