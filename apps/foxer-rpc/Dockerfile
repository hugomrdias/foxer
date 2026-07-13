# syntax=docker/dockerfile:1

FROM oven/bun:1.3.10-alpine AS base
WORKDIR /app

FROM base AS workspace
COPY package.json bun.lock tsconfig.json ./
COPY apps/erpc/package.json apps/erpc/package.json
COPY apps/foc-api/package.json apps/foc-api/package.json
COPY apps/foc-app/package.json apps/foc-app/package.json
COPY apps/foc-cli/package.json apps/foc-cli/package.json
COPY packages/foxer-client/package.json packages/foxer-client/package.json
COPY packages/foxer-react/package.json packages/foxer-react/package.json
COPY packages/foxer-rpc/package.json packages/foxer-rpc/package.json
COPY packages/foxer/package.json packages/foxer/package.json

FROM workspace AS build-deps
RUN bun install --frozen-lockfile \
  --filter foxer-repo \
  --filter @hugomrdias/foxer-rpc

FROM build-deps AS build
COPY packages/foxer-rpc packages/foxer-rpc
WORKDIR /app/packages/foxer-rpc
RUN bun run build

FROM workspace AS production-deps
ENV NODE_ENV=production
RUN bun install --frozen-lockfile --production \
  --filter @hugomrdias/foxer-rpc

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=8545

RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 --ingroup nodejs foxer-rpc

COPY --from=production-deps --chown=1001:1001 /app /app
COPY --from=build --chown=1001:1001 /app/packages/foxer-rpc/dist/src /app/packages/foxer-rpc/dist
COPY --from=build --chown=1001:1001 /app/packages/foxer-rpc/drizzle /app/packages/foxer-rpc/drizzle

EXPOSE 8545
USER foxer-rpc
WORKDIR /app/packages/foxer-rpc

CMD ["bun", "run", "dist/bin/index.js", "start"]
