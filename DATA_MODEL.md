# SISERA V2 — DATA MODEL & DATABASE SPECIFICATION

> **Relational Schemas, Double-Entry Financial Accounting, Time-Series Storage, and Migration Guide**

---

## 1. Storage Architecture (ADR-004)

Sisera divides persistence into distinct transactional and analytical layers:
1. **PostgreSQL 16 (Transactional & Canonical Accounting)**:
   - Organizations, Users, Accounts, Permissions.
   - Instrument Master & Venue Mapping.
   - Orders, Fills, Positions, Portfolios.
   - **Double-Entry Financial Ledger** (strictly append-only).
   - Autonomous Agent Registry & Decision Provenance.
2. **ClickHouse (High-Throughput Analytics & Market Data)**:
   - L2 Order Book snapshots and depth deltas.
   - Normalized tick-by-tick trades and funding rate history.
   - Execution TCA records and market impact metrics.
3. **Redis (Ephemeral Real-Time State)**:
   - User sessions, rate-limit counters, distributed locks, ephemeral order book cache.

---

## 2. Core Entity Relationship Diagram (ERD)

```text
┌─────────────────┐       1:N       ┌─────────────────┐
│  organizations  ├────────────────►│      users      │
└────────┬────────┘                 └────────┬────────┘
         │ 1:N                               │ 1:N
         ▼                                   ▼
┌─────────────────┐       1:N       ┌─────────────────┐
│   portfolios    ├────────────────►│    accounts     │
└────────┬────────┘                 └────────┬────────┘
         │ 1:N                               │ 1:N
         ▼                                   ▼
┌─────────────────┐       1:N       ┌─────────────────┐
│     orders      ├────────────────►│  ledger_journal │
└────────┬────────┘                 └────────┬────────┘
         │ 1:N                               │ 1:N
         ▼                                   ▼
┌─────────────────┐                 ┌─────────────────┐
│   executions    │                 │ ledger_postings │
└─────────────────┘                 └─────────────────┘
```

---

## 3. Core Database Tables

### 3.1 Financial Ledger (`ledger_journal` & `ledger_postings`)
Strict double-entry accounting where every transaction is balanced across all postings:

```sql
CREATE TABLE ledger_journal (
    entry_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    correlation_id VARCHAR(64) NOT NULL,
    entry_type VARCHAR(32) NOT NULL, -- TRADE_FILL, DEPOSIT, WITHDRAWAL, FEE, REBALANCE
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE ledger_postings (
    posting_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entry_id UUID NOT NULL REFERENCES ledger_journal(entry_id),
    account_id VARCHAR(64) NOT NULL,
    asset VARCHAR(32) NOT NULL,
    amount NUMERIC(38, 18) NOT NULL, -- Decimal representation; sum(amount) == 0 per asset
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_postings_account_asset ON ledger_postings(account_id, asset);
```

### 3.2 Orders Table (`orders`)
Tracks complete order parameters and state machine progression:

```sql
CREATE TABLE orders (
    sisera_order_id VARCHAR(64) PRIMARY KEY,
    client_order_id VARCHAR(64) NOT NULL UNIQUE,
    portfolio_id VARCHAR(64) NOT NULL,
    account_id VARCHAR(64) NOT NULL,
    instrument_id VARCHAR(128) NOT NULL,
    side VARCHAR(8) NOT NULL, -- BUY, SELL
    order_type VARCHAR(16) NOT NULL, -- LIMIT, MARKET, STOP, etc.
    quantity NUMERIC(38, 18) NOT NULL,
    price NUMERIC(38, 18),
    state VARCHAR(32) NOT NULL, -- 17 OMS states
    filled_quantity NUMERIC(38, 18) NOT NULL DEFAULT 0,
    avg_fill_price NUMERIC(38, 18),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_orders_portfolio_state ON orders(portfolio_id, state);
```

### 3.3 Decision Provenance Ledger (`decision_ledger`)
Immutable log of all model and agent reasoning leading to an order or trade:

```sql
CREATE TABLE decision_ledger (
    decision_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    agent_id VARCHAR(64),
    instrument_id VARCHAR(128) NOT NULL,
    timestamp_ms BIGINT NOT NULL,
    model_name VARCHAR(64) NOT NULL,
    input_features JSONB NOT NULL,
    factors JSONB NOT NULL,
    decision_type VARCHAR(32) NOT NULL,
    expected_value NUMERIC(18, 8),
    confidence NUMERIC(6, 4),
    risk_evaluation JSONB NOT NULL,
    sisera_order_id VARCHAR(64) REFERENCES orders(sisera_order_id)
);
```

---

## 4. Migration & Schema Management (Alembic)

Database schema migrations are managed through Alembic located in `services/api/alembic/`.

### Migration Commands
```bash
# Run all pending migrations up to head
uv run alembic upgrade head

# Generate a new migration script
uv run alembic revision --autogenerate -m "add_margin_stress_columns"

# Rollback one migration step
uv run alembic downgrade -1
```
