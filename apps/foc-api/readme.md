# foc-api

`foc-api` is the workspace API/indexer app built on top of `@hugomrdias/foxer`. It indexes Calibration contracts and exposes the SQL API consumed by `foc-app`.

## Setup

From the repository root:

```bash
cp apps/foc-api/.env.example apps/foc-api/.env.local
bun install
```

Required variables in `.env.local`:

- `RPC_URL`
- `RPC_LIVE_URL`

Optional variables:

- `DATABASE_URL` to use Postgres instead of the default embedded PGlite database
- `LOG_LEVEL`
- `PORT`

## Run

```bash
bun --filter foc-api generate
bun --filter foc-api dev
```

Other useful commands:

```bash
bun --filter foc-api build
bun --filter foc-api check
```

The API listens on port `4200` by default, and the SQL endpoint is available at `http://localhost:4200/sql`.

## Database notes

If `DATABASE_URL` is not set, `foxer` will use a local PGlite database.

To run Postgres locally instead:

```bash
docker run --rm -it \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_DB=foxer \
  -p 5432:5432 \
  -v postgres-data:/var/lib/postgresql/data \
  postgres:17 -c wal_level=logical
```

### Railway

#### wal_level

```shell
railway connect indexer-pg

alter system set wal='logical';
SELECT pg_reload_conf();
```

Restart pg
