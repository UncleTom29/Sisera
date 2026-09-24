FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/ui/package.json packages/ui/package.json
COPY packages/domain/package.json packages/domain/package.json
RUN pnpm install --frozen-lockfile
COPY apps/web apps/web
COPY packages/ui packages/ui
COPY packages/domain packages/domain
RUN pnpm --filter @sisera/web build

FROM node:22-alpine AS runtime
ENV NODE_ENV=production
USER node
WORKDIR /app
COPY --from=build --chown=node:node /app /app
EXPOSE 3000
CMD ["pnpm", "--filter", "@sisera/web", "start"]
