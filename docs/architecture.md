# Sisera V2 — Architecture

> This document describes the **target** architecture that Sisera is migrating toward. The
> pre-migration baseline is documented in `docs/current-system-audit.md`. Decisions are
> recorded as ADRs in `docs/adr/`.

---

## 1. Product

Sisera is an institutional multi-asset trading terminal: market intelligence, deterministic
execution, quantitative models, cross-asset analysis, institutional risk controls, portfolio
intelligence, autonomous agents, decision provenance, and execution analytics.

The intelligence philosophy is a single pipeline:

```text
Observe → Understand → Predict → Decide → Optimize → Execute → Reassess → Learn
```

## 2. Critical invariant — LLMs never place trades

```text
User / Strategy / Agent
        ↓
AI Intent Compiler            (LLM may generate *typed* intents)
        ↓
Typed TradeIntent             (schema-validated)
        ↓
TradePlan
        ↓
Deterministic Policy Engine
        ↓
Pre-Trade Risk Engine
        ↓
Approval Engine
        ↓
OMS
        ↓
Execution Engine
        ↓
Smart Order Router
        ↓
Venue Adapter
        ↓
Exchange / DEX / Prediction Venue
```

LLMs may research, summarize, reason, explain, propose strategies, generate typed intents,
and generate strategy manifests. They may **not** bypass validation, authorization, risk
rules, approval policies, capital limits, venue permissions, or execution policies
(ADR-008).

## 3. Repository layout (monorepo)

```text
apps/            web (Next.js/TS), mobile (React Native/Expo)
services/        api, auth, market-data, instrument-master, portfolio, risk, oms,
                 execution, agents, intelligence, notifications, ledger
packages/        domain, api-client, schemas, ui, config, observability
quant/           indicators, intelligence, scoring, opportunity, strategies,
                 backtesting, attribution, optimization, research
connectors/      exchanges, dex, prediction, market-data, macro, news, wallets
workers/         scanner, market-data, risk-monitor, agent-runtime, settlement, analytics
infra/           docker, terraform, helm, monitoring
tests/           unit, integration, contract, replay, e2e, security
docs/            adr, connectors, operations
```

The existing `sisera/` package is migrated into this layout progressively (§56 of the
product spec), preserving working tests and backward compatibility where reasonable.

## 4. Technology stack

- **Backend/quant:** Python 3.12, FastAPI, Pydantic, SQLAlchemy 2, Alembic, NumPy,
  pandas/Polars, scikit-learn/LightGBM (where justified), async where appropriate.
- **Financial types:** `Decimal` (ADR-002) via `packages/domain` — never binary float for
  balances, quantities, fees, or ledger amounts.
- **Web:** TypeScript + Next.js + React + TanStack Query + Zustand + WebSocket +
  lightweight-charts (no proprietary TradingView library without a license).
- **Mobile:** React Native + Expo + TypeScript + secure key storage + biometrics + push.

## 5. Data & storage (ADR-004)

| Store | Role |
|---|---|
| PostgreSQL (+Timescale local) | Canonical transactional state: orgs, users, accounts, instruments, portfolios, strategies, orders, executions, agents, policies, permissions, audit, **financial ledger**. |
| ClickHouse (production analytics) | High-volume time-series/events: ticks, OHLCV, order books, liquidations, funding, signals, TCA. |
| Redis | Ephemeral caches, locks, rate limiting, transient realtime state. Not the ledger. |
| NATS JetStream (ADR-003) | Durable typed events with correlation IDs. |
| MinIO / S3 | Historical datasets, model artifacts, backtest artifacts, exports, audit evidence. |

## 6. Domain model

- **Instrument Master (ADR-005):** `CanonicalAsset` vs `VenueInstrument`. Instrument types:
  `SPOT`, `PERPETUAL`, `FUTURE`, `OPTION`, `TOKENIZED_EQUITY`, `TOKENIZED_FUND`, `RWA`,
  `FX`, `COMMODITY`, `INDEX`, `PREDICTION_BINARY`, `PREDICTION_MULTI_OUTCOME`,
  `PREDICTION_SCALAR`. Never infer an instrument from a bare ticker.
- **OMS (ADR-006):** full order state machine, idempotency, parent/child orders.
- **Financial Ledger (ADR-007):** append-only double-entry, compensating corrections,
  reconciliation with discrepancy reports.
- **Decision Ledger:** queryable provenance (`strategy_version`, `model_version`,
  `risk_policy_version`, features, EV, confidence, outcome, counterfactual, attribution).

## 7. Risk (deterministic)

Pre-trade checks (max order/position, gross/net exposure, leverage, concentration, margin,
liquidation buffer, stale-data rejection), realtime monitors (margin utilization,
liquidation distance, drawdown, correlation clustering, funding), and stress testing.

Kill switches exist at global/org/desk/portfolio/account/strategy/agent/instrument/venue
levels. Live trading is disabled by default via `SISERA_LIVE_TRADING_ENABLED=false` and is
gated by `packages/config`'s `LiveTradingGuard`.

## 8. Agents (ADR-009)

Autonomy levels `RESEARCH / SUGGEST / CONFIRM / POLICY_AUTO / AUTONOMOUS /
EMERGENCY_RISK_ONLY`. Lifecycle `DRAFT → BACKTEST → STRESS TEST → PAPER → SHADOW →
LIMITED LIVE → LIVE`. Manifests are schema-validated, versioned, immutable after deploy.

## 9. Observability (spec §47)

OpenTelemetry traces/metrics, structured JSON logs, correlation IDs
(`user action → intent → risk → order → execution → fill → ledger`), Prometheus/Grafana.

## 10. Current migration state

| Phase | Status |
|---|---|
| 0 — Audit & security | ✅ Complete (`docs/current-system-audit.md`, credential remediation, ADRs) |
| 1 — Platform foundation | ✅ `packages/domain` + `packages/config` + `packages/schemas` + dev infra |
| 2 — Canonical domain | ✅ Instrument Master, financial types, double-entry ledger |
| 4 — OMS / Execution | ✅ Order state machine, idempotent OMS, venue adapter, paper engine |
| 5 — Risk / Portfolio / Ledger | ✅ Portfolio, deterministic risk, stress testing (domain cores) |
| 7/13 — Routing / Analytics | ✅ Smart Order Router, TCA (domain cores) |
| 9/10 — Agents / Prediction | ✅ Autonomy levels, manifests, prediction-market domain |
| 3 — Market-data platform | 🚧 Canonical event schemas done; Bybit normalization/migration pending |
| 6 — Web terminal | ⏳ Pending (rebuild `apps/web`) |
| 8 — AI | ⏳ Pending (copilot, intent compiler) |
| 11 — Mobile | ⏳ Pending |
| 12 — Institutional controls | ⏳ Pending (auth/RBAC/approvals/SSO) |
| Persistence (Postgres/ClickHouse) | ⏳ Domain cores are in-memory; service persistence pending |

Phase gates (spec §65): format, lint, typecheck, test, security checks, docs, migrations
from clean state, local boot, descriptive commit.
