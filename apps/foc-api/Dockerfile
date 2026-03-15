# syntax=docker/dockerfile:1

FROM oven/bun:1.3-alpine AS base
WORKDIR /app

# Install dependencies
FROM base AS deps
COPY package.json tsconfig.json ./
COPY apps/foc-api/package.json apps/foc-api/package.json
COPY packages/foxer/package.json packages/foxer/package.json

RUN bun install --production

# Copy source code
FROM deps AS build
COPY apps/foc-api apps/foc-api
COPY packages/foxer packages/foxer

# Production runner
FROM base AS runner
ENV NODE_ENV=production
ENV PORT=4200
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 foc-api

COPY --from=build /app /app

EXPOSE 4200
USER foc-api
WORKDIR /app/apps/foc-api

CMD ["bun", "run", "start"]