# Sisera Runbook

## Local boot (verified 2026-09-22)

```bash
uv sync
SISERA_ENVIRONMENT=dev SISERA_DEV_TOKEN=dev-secret-123 \
  uv run uvicorn sisera_api.main:app --port 8001
curl http://localhost:8001/api/v1/health  # {"status":"ok"}
```

- SQLite files land in `var/` (gitignored). Postgres via `SISERA_POSTGRES_URL`
  (see `docs/postgres-setup.md`; production uses Alembic, not `create_all`).
- Mutating endpoints require `Authorization: Bearer $SISERA_DEV_TOKEN` (dev only;
  refused in staging/prod). Production uses Privy JWT (`docs/auth-privy.md`).

## Verify auth enforcement

```bash
# 401 without token
curl -o /dev/null -w "%{http_code}\n" -X POST localhost:8001/api/v1/orders \
  -H "Content-Type: application/json" -d '{...}'
# 201 with token; response carries authenticated user_id
curl -X POST localhost:8001/api/v1/orders \
  -H "Authorization: Bearer $SISERA_DEV_TOKEN" -H "Content-Type: application/json" -d '{...}'
```

## Run tests / lint

```bash
uv run pytest
uv run ruff check packages/ services/ connectors/ quant/ workers/
```

## Rotate credentials

See `docs/security/credential-remediation.md`. Never commit `.env`, `*.session`,
`*.key`, or `var/`.

## Kill switches

Trip via `CircuitBreaker.trip()` (service layer) or the risk-monitor worker. Global trips
block all scopes. All trips/clears record actor + reason + timestamp.
