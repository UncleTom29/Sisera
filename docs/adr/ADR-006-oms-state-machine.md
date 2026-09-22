# ADR-006 — OMS state machine

**Status:** Accepted
**Date:** 2026-09-22

## Context

V1 has no Order Management System — orders are fire-and-forget adapter calls with no
persisted lifecycle, no idempotency, and no parent/child structure.

## Decision

- Build a real OMS with the canonical order states from spec §12:

```text
CREATED → VALIDATING → RISK_CHECK → (RISK_REJECTED | APPROVAL_PENDING → APPROVED)
  → ROUTING → SUBMITTING → ACKNOWLEDGED → PARTIALLY_FILLED → FILLED
  → (CANCEL_PENDING → CANCELLED) | REJECTED | EXPIRED | UNKNOWN
```

- Every order carries a Sisera order ID, client order ID, venue order ID (where
  applicable), strategy/agent source, user source, portfolio, account, instrument, risk
  decision ID, approval decision ID, timestamps, and a full lifecycle history.
- **Idempotency is mandatory**: duplicate requests must not produce duplicate trades
  (idempotency keys on mutating endpoints; persisted client order IDs).
- Support the order types from spec §12: market, limit, post-only, reduce-only, IOC, FOK,
  stop, stop-limit, take-profit, trailing stop, OCO (where supported), bracket orders, and
  parent/child orders.

## Consequences

- The V1 `ExecutionAdapter` protocol is replaced by the OMS + venue-adapter layering
  (intent → risk → OMS → execution → router → venue adapter).
- Order state transitions are property-tested (V2 §51).
