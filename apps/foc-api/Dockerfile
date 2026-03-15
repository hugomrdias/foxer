# syntax=docker/dockerfile:1

# Build from the repository root:
# docker build -f apps/foc-api/Dockerfile -t foc-api .
FROM node:24-bookworm-slim AS base
WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"

RUN corepack enable

FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json ./
COPY apps/foc-api/package.json apps/foc-api/package.json
COPY packages/foxer/package.json packages/foxer/package.json

RUN pnpm install --no-frozen-lockfile --ignore-scripts

FROM deps AS build
COPY apps/foc-api apps/foc-api
COPY packages/foxer packages/foxer

RUN pnpm --filter @hugomrdias/foxer build

FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4200

RUN groupadd --system nodejs && useradd --system --gid nodejs foc-api

COPY --from=build /app /app

EXPOSE 4200
USER foc-api

CMD ["node", "packages/foxer/dist/src/bin/index.js", "start", "--root", "apps/foc-api", "--config", "foxer.config.ts"]