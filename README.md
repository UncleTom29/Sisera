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
cp -n .env.example .env
pnpm install
docker compose -f infra/docker-compose.yml up -d
pnpm dev
```

Open `http://localhost:3000`. The API runs on `http://localhost:4000`.

The terminal and screener refresh while visible. Spot quotes, candles, and depth come from
Binance's public market-data host (`data-api.binance.vision`), which requires no API key.
Prediction markets use Polymarket Gamma. Provider failures remain visible as unavailable states;
the interface never fills gaps with sample prices. The order ticket is a paper-trading preview
until a reconciled portfolio and risk limits are connected.

`pnpm dev` loads the repository `.env` when present, preserves existing values, and supplies
local-only operator/auth defaults for any missing development variables. This means an existing
legacy `.env` is not overwritten. Set `SISERA_LOCAL_OPERATOR_MODE=false` and
`SISERA_ALLOW_DEV_AUTH=false` when testing the Keycloak flow; neither option may be enabled in a
deployment.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Read `docs/architecture.md`, `docs/security.md`, `docs/operations.md`, and
`docs/design-sources.md` before connecting a venue.
