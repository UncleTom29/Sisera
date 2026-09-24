FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY packages/domain/package.json packages/domain/package.json
COPY packages/risk/package.json packages/risk/package.json
COPY packages/oms/package.json packages/oms/package.json
COPY packages/copilot/package.json packages/copilot/package.json
COPY packages/market-data/package.json packages/market-data/package.json
RUN pnpm install --frozen-lockfile
COPY apps/api apps/api
COPY packages/domain packages/domain
COPY packages/risk packages/risk
COPY packages/oms packages/oms
COPY packages/copilot packages/copilot
COPY packages/market-data packages/market-data
RUN pnpm --filter @sisera/api... build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
EXPOSE 4000
CMD ["node", "apps/api/dist/server.js"]
