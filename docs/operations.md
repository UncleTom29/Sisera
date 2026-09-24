# Operations

## Local stack

`infra/docker-compose.yml` starts PostgreSQL, Redis, Keycloak, Prometheus, and Grafana. Credentials in
that file are local-only and must never be reused outside a developer machine.

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
