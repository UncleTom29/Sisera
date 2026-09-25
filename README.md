# Sisera

Sisera is an institutional multi-asset trading operating system for research, portfolio risk,
execution, paper trading, agent governance, and prediction markets.

This branch is a clean rebuild. It does not preserve the previous application architecture.
Concepts retained from the earlier project are limited to deterministic pre-trade controls,
decision provenance, agent promotion stages, stress testing, and market-data quality states.

## What runs today

- Next.js web application with a public landing page and protected terminal.
- Fastify control-plane API with OIDC RBAC, request tracing, structured errors, and health checks.
- Normalized instrument, order, portfolio, prediction-market, and agent contracts.
- Deterministic pre-trade risk and intent compilation.
- Live Binance spot and Polymarket adapters. Failed providers return unavailable states; Sisera never
  substitutes invented prices.
- Paper-order orchestration that refuses stale quotes and always passes through risk controls.
- PostgreSQL schema, Docker development stack, CI, unit tests, and runbooks.

## Quick start

```bash
cp .env.example .env
pnpm install
docker compose -f infra/docker-compose.yml up -d
pnpm dev
```

Open `http://localhost:3000`. The API runs on `http://localhost:4000`.

For local UI evaluation only, set `SISERA_LOCAL_OPERATOR_MODE=true`. API development auth remains
disabled unless `SISERA_ALLOW_DEV_AUTH=true`; neither option should be enabled in deployments.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Read `docs/architecture.md`, `docs/security.md`, and `docs/operations.md` before connecting a venue.
