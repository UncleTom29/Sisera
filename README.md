# Sisera

Sisera is a trading and intelligence terminal for tokenized equities, private markets, and stock-linked assets on Solana. Traders can discover markets, inspect source-linked research, compare token prices with reference values, use guarded trading flows, and review observed wallet exposure. Research-only agent drafts carry explicit capital and risk limits.

Sisera presents tokenized stocks with available Pyth Core equity references, observed liquidity, source-linked news, and provenance. Missing or stale inputs remain visible as such. The web terminal is the current product; mobile applications and autonomous trading remain roadmap work.

## What runs today

- Next.js web application with separate public-stock and private-market catalogues, asset pages, wallet controls, and paper/live trading tickets.
- Fastify control-plane API with Privy token verification, organization RBAC, tracing, and health checks.
- Normalized instrument, order, portfolio, prediction-market, and agent contracts.
- Deterministic pre-trade risk and intent compilation.
- Public xStocks catalogue and DEX market activity, plus PreStocks private-company prices, marks, and valuation gaps.
- Helius wallet balances, Pyth Core equity reference feeds through Hermes when the key is entitled to those feeds, public equity quote fallback, CoinMarketCap market breadth and tokenized asset coverage, Clawpump discovery, and company news. Optional Marketaux, GNews, and Finnhub keys add news coverage. Hermes requires a Pyth Core API key; no Pyth Pro subscription is needed.
- Indicative xStocks wallet valuation, read-only perp stress sensitivity, CSV observation export, and agent draft data-readiness checks. These observations are not a reconciled portfolio ledger or promotion evidence.
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

Provider keys are optional in local research mode. Set `NEXT_PUBLIC_PRIVY_APP_ID` in the web environment and the matching `PRIVY_APP_ID` plus `PRIVY_APP_SECRET` in the API environment for real sign-in. Live trading also needs `DATABASE_URL`, `HELIUS_API_KEY` (or `SOLANA_RPC_URL`), and `JUPITER_API_KEY` on the API server. Configure `PYTH_API_KEY` for Pyth Core Hermes reference feeds; equity price access depends on the key's feed entitlements. When equity prices return 403, the API uses public equity quotes and marks them as prior market readings where appropriate. Set `COINMARKETCAP_API_KEY` for crypto market breadth, market sentiment, asset profiles, and tokenized stock aggregates. Both keys must remain on the API server; do not add them to `NEXT_PUBLIC_*` settings. Set `PYTH_HERMES_URL` only when using a trusted compatible Hermes provider. `HELIUS_WEBHOOK_SECRET`, `CLAWPUMP_API_KEY`, `MARKETAUX_API_KEY`, `GNEWS_API_KEY`, and `FINNHUB_API_KEY` extend other coverage.
For the VPS deployment, keep those Privy variables and `DATABASE_URL` in `/opt/sisera/.env.production` and set `SISERA_API_URL=http://127.0.0.1:4200` for server-side workspace data. The production systemd services serve the API on port 4200 and the web app on port 3100 through Nginx. GitHub Actions validates the values, applies migrations, builds on the VPS, restarts those services, and checks the API and sign-in page before reporting success. The production example is in `infra/.env.production.example`.
Set `SISERA_PUBLIC_URL` to the public origin served by the VPS (currently `https://sisera.xyz`). The deploy checks that both the local server and public origin serve the sign-in JavaScript referenced by the new HTML.
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
