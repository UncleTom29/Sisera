# Sisera

Sisera is a full-stack trading and intelligence terminal for tokenized equities, private markets, stock-linked assets, and autonomous trading agents on Solana. It gives traders one place to discover markets, understand what is moving them, compare onchain prices with reference values, execute trades, manage portfolios, measure risk, and deploy agents that can trade continuously within explicit capital and risk limits.

Instead of treating tokenized stocks as isolated SPL tokens with a chart and swap button, Sisera treats them as financial instruments: every market has reference pricing (Pyth), valuation context, liquidity analysis, portfolio exposure, execution quality, news and event intelligence, and an auditable history of how both humans and agents acted on it. Sisera is available as a professional web terminal and as a mobile trading application for **Solana Mobile, Android, and iOS**.

## What runs today

- Next.js web application with separate public-stock and private-market catalogues, asset pages, wallet controls, and paper/live trading tickets.
- Fastify control-plane API with Privy token verification, organization RBAC, tracing, and health checks.
- Normalized instrument, order, portfolio, prediction-market, and agent contracts.
- Deterministic pre-trade risk and intent compilation.
- Public xStocks catalogue and DEX market activity, plus PreStocks private-company prices, marks, and valuation gaps.
- Helius wallet observation, Pyth Pro reference-price adapter, Clawpump discovery, and GDELT news work without paid credentials where their public endpoints are available. Optional Marketaux, GNews, and Finnhub keys add news coverage.
- Jupiter order and execution routes support user-signed Solana swaps after server-side account, balance, risk, and order checks. Sisera never holds a wallet private key.
- Existing Hyperliquid, Binance, and Polymarket adapters remain secondary. Provider failures
  return unavailable states; Sisera never substitutes invented prices.
- PostgreSQL schema, automated database migrations, CI, unit tests, and production runbooks.

## Quick start

```bash
cp -n .env.example .env
pnpm install
pnpm db:migrate
pnpm dev
```

Open `http://localhost:3000`. The API runs on `http://localhost:4000`.

The default workspace is `/stocks` for public xStocks; `/private-markets` reads `prestocks.com/api/prestocks`.
The `/terminal?venue=hyperliquid` and `/markets?venue=binance` paths retain broader markets.
PreStocks does not provide an authoritative quote timestamp, chart, or liquidity in its public catalogue; Sisera does not invent these values. Paper fills use the displayed indicative price. Live swaps use a fresh Jupiter order quote and explicit wallet signature.

`pnpm dev` loads the repository `.env` when present, preserves existing values, and supplies
local-only operator/auth defaults for any missing development variables. This means an existing
legacy `.env` is not overwritten. The example file leaves these flags unset so `pnpm dev` can
open the stock workspace without Privy credentials. Set `SISERA_LOCAL_OPERATOR_MODE=false` and
`SISERA_ALLOW_DEV_AUTH=false` when testing the Privy flow; neither option may be enabled in a
deployment. Use the same Privy app ID in `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_ID`, with
`PRIVY_APP_SECRET` server-side only. Apply migrations `0002_privy_identity.sql` and
`0003_solana_webhook_events.sql` and `0004_solana_swap_orders.sql` to an existing PostgreSQL volume before enabling Privy membership mapping, Helius event intake, or paper/live order persistence.

Provider keys are optional in local research mode. Set `NEXT_PUBLIC_PRIVY_APP_ID` in the web environment and the matching `PRIVY_APP_ID` plus `PRIVY_APP_SECRET` in the API environment for real sign-in. Live trading also needs `DATABASE_URL`, `HELIUS_API_KEY` (or `SOLANA_RPC_URL`), and `JUPITER_API_KEY` on the API server. Configure `PYTH_PRO_API_KEY`, `HELIUS_WEBHOOK_SECRET`, `CLAWPUMP_API_KEY`, `MARKETAUX_API_KEY`, `GNEWS_API_KEY`, and `FINNHUB_API_KEY` for additional coverage.
For the VPS deployment, keep those Privy variables and `DATABASE_URL` in `/opt/sisera/.env.production` and set `SISERA_API_URL=http://127.0.0.1:4000` for server-side workspace data. GitHub Actions validates the values, applies migrations, builds on the VPS, and checks the API and sign-in page before reporting success. The production example is in `infra/.env.production.example`.
Set `OPENROUTER_API_KEY` and `SISERA_INTELLIGENCE_MODEL` to enable on-demand, read-only stock
assessments. Model responses are schema-validated and cannot submit orders.
These server credentials are never sent to the browser. Jupiter transactions are signed in the user's wallet. Use a small funded wallet for mainnet testing; automated Clawpump launch and Meteora pool creation are not part of this workflow.

## Verification

```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

Read `docs/architecture.md`, `docs/security.md`, `docs/operations.md`, and
`docs/design-sources.md` before connecting a venue.
