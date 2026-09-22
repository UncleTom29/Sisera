# Migration Guide — V1 (`sisera/`) → V2 (monorepo)

V1 continues to run unchanged. New development targets the canonical domain, services,
and schemas. This guide maps old → new for each subsystem.

## Python imports

| Old (`sisera/`) | New (canonical) | Notes |
|---|---|---|
| `sisera.opportunity.models.Opportunity` (float) | `sisera_domain.Opportunity` (Decimal) | Canonical opportunity uses Decimal + `OpportunityStructure` + explicit `NO_TRADE` |
| `sisera.risk.models.Position/PortfolioState` | `sisera_domain.Position/Portfolio` | Decimal-based; hierarchical via `parent_id` |
| `sisera.ledger` (decision ledger, SQLite) | `sisera_domain.Ledger` + `services/ledger` | Financial double-entry (new) + decision provenance (persisted) |
| `sisera.execution.adapter.ExecutionAdapter` | `sisera_domain.VenueAdapter` + `connectors/exchanges/bybit` | Capability flags; paper engine is deterministic |
| `sisera.data.bybit.BybitClient` | `sisera_bybit.BybitVenueAdapter` + `sisera_marketdata.normalize_*` | Canonical events with `DataQuality`; no silent synthetic fallback |
| `sisera.config.Config` (global singleton) | `sisera_config.Settings` + `LiveTradingGuard` | Typed, validated, live-trading gate |
| `sisera.risk.manager.RiskManager` | `sisera_domain.RiskEngine` + `StressEngine` | Deterministic pre-trade + scenarios |
| `sisera.scoring` / `sisera.indicators` | `quant/` (backtesting harness) + `sisera_domain.governance/differential/graph` | V1 quant stays in place; new research targets the canonical domain |

## Configuration

| Old env | New env | Notes |
|---|---|---|
| `SISERA_BYBIT_API_KEY/SECRET`, `SISERA_USE_TESTNET` | Same, plus `SISERA_ENVIRONMENT` + `SISERA_LIVE_TRADING_ENABLED` | Live requires `ENVIRONMENT=prod` **and** `LIVE_TRADING_ENABLED=true` |
| `SISERA_CACHE_DB`, `SISERA_LEDGER_DB` (SQLite files) | `SISERA_POSTGRES_URL` (+ Alembic migrations) | SQLite retired as production state |
| (none) | `SISERA_NATS_URL`, `SISERA_REDIS_URL`, `SISERA_S3_*` | Event bus, cache, object storage |

## Database

- V1 SQLite files (`sisera_cache.db`, `sisera_ledger.db`) are **not** migrated automatically.
  Historical decision-ledger rows can be exported and re-imported via the repository
  `record()` methods; financial history starts clean (compensating opening balances).
- Each service owns its Alembic migrations (`services/*/alembic`); run `alembic upgrade head`
  with `-x db_url=...` or `SISERA_POSTGRES_URL` set.

## API

- V1: unversioned `/api/*` on the legacy FastAPI app (unauthenticated).
- V2: versioned `/api/v1/*` on `services/api` (instruments, orders, ledger, portfolios).
  Mutating endpoints are idempotent (`client_order_id` / `entry_id`).
