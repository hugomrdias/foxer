# foc-api

`foc-api` is the workspace API/indexer app built on top of `@hugomrdias/foxer`. It indexes Calibration contracts and exposes the SQL API consumed by `foc-app`.

## Setup

From the repository root:

```bash
cp apps/foc-api/.env.example apps/foc-api/.env.local
pnpm install
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
pnpm --filter foc-api generate
pnpm --filter foc-api dev
```

Other useful commands:

```bash
pnpm --filter foc-api build
pnpm --filter foc-api lint
pnpm --filter foc-api typecheck
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
