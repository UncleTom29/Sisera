# PostgreSQL Setup & Verification

Each service owns its Alembic history with an independent version table
(`alembic_version_<service>`), so all services can share one Postgres database without
migration conflicts.

## Create the database

```bash
createdb sisera
```

## Run all migrations

```bash
for svc in ledger oms instrument-master portfolio auth; do
  (cd services/$svc && alembic -c alembic.ini upgrade head)
done
```

This reads `SISERA_POSTGRES_URL` (default
`postgresql+psycopg://sisera:sisera@localhost:5432/sisera`). Override per-run with:

```bash
alembic -c alembic.ini -x db_url="postgresql+psycopg://user@host:5432/sisera" upgrade head
```

## Verified

- All 5 services migrate cleanly against real PostgreSQL 14 (shared DB, independent
  version tables) — verified 2026-09-22.
- Exact Decimal: `0.1 + 0.2 == 0.3` on NUMERIC; idempotent posts; cross-service
  ledger + OMS coexistence.
- SQLite remains the zero-ops backend for unit tests; Postgres is required for any
  shared/staging/prod deployment.
