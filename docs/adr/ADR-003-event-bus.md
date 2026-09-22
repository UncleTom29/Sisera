# ADR-003 — Event bus

**Status:** Accepted
**Date:** 2026-09-22

## Context

V1 wires cross-cutting concerns (settlement, reconciliation, attribution, notifications)
as inline method calls on the 1,000-line `Orchestrator`. This does not scale to the V2
service boundaries and makes it impossible to replay or audit events independently.

## Decision

- Adopt **NATS JetStream** as the durable event infrastructure (typed, durable streams with
  consumers, wildcard subjects, and replay). Redpanda/Kafka is deferred — the workload
  doesn't yet justify Kafka-compatible complexity.
- Define typed event schemas in `packages/schemas` for every canonical event (market data,
  orders, fills, risk decisions, ledger postings, agent actions, alerts).
- Services publish domain events; workers consume them. Correlation IDs propagate from
  `user action → intent → risk → order → execution → fill → ledger` (V2 §47).
- Redis remains for ephemeral caches/locks, **not** as the canonical financial ledger
  (ADR-007).

## Consequences

- The V1 `Orchestrator` is decomposed: scan/scheduling becomes a worker, decision/risk
  becomes services, and the pipeline is expressed as events.
- A local NATS container is part of the one-command dev environment (`make dev`).
