# Sisera

**The intelligent multi-asset trading terminal.**

Sisera combines market intelligence, deterministic execution, quantitative models,
cross-asset analysis, institutional risk controls, portfolio intelligence, autonomous
agents, decision provenance, and execution analytics — for crypto spot, perpetuals, dated
futures, options, tokenized assets, FX, commodities, indices, and prediction markets.

> **Status:** V2 migration in progress. The pre-migration baseline (a Bybit-perpetuals
> trading bot) is documented in `docs/current-system-audit.md`; the target architecture in
> `docs/architecture.md`. Live trading is **disabled by default**.

---

## Product principles

- **Sisera is execution infrastructure, not an AI chatbot.** AI is an interface and
  intelligence layer, never the execution path.
- **Risk is deterministic.** LLMs do not decide whether risk constraints apply.
- **Every financial event is auditable.** Orders are not accounting; the double-entry
  financial ledger is.
- **Every autonomous action is attributable.** Every live number has provenance.

The pipeline: `Observe → Understand → Predict → Decide → Optimize → Execute → Reassess →
Learn`.

## Architecture

```text
                         SISERA
                           │
              ┌────────────┴────────────┐
              │                         │
         Web Terminal               Mobile
              │                         │
              └────────────┬────────────┘
                           │
                    API / Realtime
                           │
          ┌────────────────┼────────────────┐
          │                │                │
     Sisera AI        Agent Runtime      Portfolio
          │                │                │
          └────────────────┼────────────────┘
                           │
                    Decision Policy
                           │
                      Risk Engine
                           │
                           OMS
                           │
                    Execution Engine
                           │
                   Smart Order Router
                           │
       ┌───────────────────┼───────────────────┐
       │                   │                   │
      CEX               Onchain            Prediction
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    Financial Ledger
```

The monorepo:

```text
apps/            web, mobile
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

## Quickstart

```bash
# Install dependencies (uv)
uv sync

# Run the test suite
make test            # or: uv run pytest

# Boot local infrastructure + web dashboard
make dev

# Lint
make lint
```

Local infrastructure (`infra/docker/docker-compose.yml`): PostgreSQL/Timescale, Redis,
NATS JetStream, MinIO, Prometheus, Grafana (ClickHouse behind the `analytics` profile).

## Paper trading

Paper execution is deterministic and does not contact any exchange. To run against Bybit
testnet, set `SISERA_BYBIT_API_KEY`/`SISERA_BYBIT_API_SECRET` and `SISERA_USE_TESTNET=true`.
Live trading requires `SISERA_ENVIRONMENT=prod` **and** `SISERA_LIVE_TRADING_ENABLED=true`
(see `SECURITY.md`).

## Documentation

| Doc | Purpose |
|---|---|
| `docs/architecture.md` | Target architecture + migration state |
| `docs/current-system-audit.md` | Pre-migration baseline audit |
| `docs/adr/` | Architecture Decision Records |
| `docs/security/credential-remediation.md` | Credential rotation checklist |
| `SECURITY.md` | Security posture + invariants |
| `SCOPE.md` | Original V1 scope & design intent |
| `deployment.md` | Deployment guide |
| `docs/data-model.md` | Canonical domain data model |

## Test commands

```bash
uv run pytest                 # full suite
uv run pytest packages/domain # domain unit + property tests
uv run ruff check .           # lint
```
