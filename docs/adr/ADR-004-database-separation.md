# ADR-004 — Database separation

**Status:** Accepted
**Date:** 2026-09-22

## Context

V1 stores everything in two SQLite files (`sisera_cache.db`, `sisera_ledger.db`) with no
migration tooling and SQLite's concurrency ceiling. V2 needs transactional integrity for
accounting plus high-volume time-series analytics.

## Decision

- **PostgreSQL** is the canonical transactional store: organizations, users, accounts,
  instruments, portfolios, strategies, orders, executions, agents, policies, permissions,
  audit events, and the financial ledger. Managed with **Alembic** migrations.
- **ClickHouse** stores high-volume time-series/event data: ticks, OHLCV, order-book
  snapshots, liquidations, funding history, signals, execution analytics, TCA.
- **Redis** for ephemeral caches, locks, rate limiting, and transient realtime state.
- **S3-compatible object storage (MinIO locally)** for historical datasets, model
  artifacts, backtest artifacts, exports, and long-term audit evidence.
- For local development where ClickHouse would be heavy, provide a **PostgreSQL/Timescale
  local profile** while retaining ClickHouse for production.

## Consequences

- V1 SQLite stores are retired as production state; the Decision Ledger moves to Postgres
  (ADR-007 covers the separate financial ledger).
- Every V2 service gets an explicit storage contract; no service shares another's tables.
