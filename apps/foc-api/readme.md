# api

## usage

```shell
pnpm drizzle-kit generate
pnpm dev
pnpm drizzle-kit studio # to start database UI
```

By default it uses pglite to use Postgres run the command below and set DATABASE_URL.

```shell
docker run --rm -it -e POSTGRES_PASSWORD=postgres -e POSTGRES_USER=postgres -e POSTGRES_DB=foxer -p 5432:5432 -v postgres-data:/var/lib/postgresql/data postgres:17 -c wal_level=logical
```
