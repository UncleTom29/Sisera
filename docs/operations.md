# Operations

## Local stack

`infra/docker-compose.yml` starts PostgreSQL, Redis, Prometheus, and Grafana. Credentials in
that file are local-only and must never be reused outside a developer machine.
New PostgreSQL volumes apply migrations `0000` through `0004` in order. For an existing volume,
apply `packages/db/migrations/0002_privy_identity.sql` and
`packages/db/migrations/0003_solana_webhook_events.sql` and
`packages/db/migrations/0004_solana_swap_orders.sql` manually before enabling Privy membership,
Helius webhook intake, or paper/live order persistence. Do not reset a volume just to re-run initialization.

## Trading credentials

Privy requires one app ID shared by web and API, plus a server-only app secret. Helius RPC and Jupiter require API keys. Set `DATABASE_URL` for persistent orders. Without these credentials, the public markets and local paper mode still run, but mainnet orders cannot be submitted. Never put `PRIVY_APP_SECRET`, `HELIUS_API_KEY`, or `JUPITER_API_KEY` in a `NEXT_PUBLIC_` variable.

## Readiness

- `/health/live` confirms the process is alive.
- `/health/ready` is the deployment readiness contract. Add PostgreSQL, Redis, and venue checks before
  enabling order submission in an environment.
- `/metrics` exposes Prometheus process and HTTP metrics.

## Initial production SLOs

- Control-plane availability: 99.95% monthly.
- P99 market snapshot read: 500 ms, excluding provider outage.
- P99 pre-trade decision: 50 ms after snapshots are loaded.
- Order state divergence: zero tolerated; reconciliation alerts immediately.
- Decision-ledger write failure: halt new execution.

## Incident defaults

1. Disable new order routing.
2. Keep market reads and operator visibility available.
3. Cancel working orders only through a reconciled venue command.
4. Record the incident correlation ID and preserve all decision inputs.
5. Resume in paper mode before restoring limited live execution.
