# erpc

This app contains the eRPC configuration used for Calibration RPC access, realtime routing, and response caching.

## Setup

Copy the example environment file:

```bash
cp .env.example .env.local
```

Expected variables:

- `RPC_REALTIME_TOKEN`
- `RPC_ARCHIVE_TOKEN`
- `DATABASE_URL`

## Run with Docker

Build and run the container from this directory:

```bash
docker build -t hd/erpc .
docker run --env-file=".env.local" --rm -it -p 4000:4000 -p 4001:4001 hd/erpc
```

The config serves HTTP on port `4000` and exposes the secondary port `4001` from the container as well.
