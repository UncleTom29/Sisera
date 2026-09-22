# ADR-007 — Ledger architecture

**Status:** Accepted
**Date:** 2026-09-22

## Context

V1's "ledger" is a *decision* ledger (provenance of why a trade was decided), not an
accounting ledger. Orders and portfolio tables are used to derive financial state, which is
not auditable accounting. V2 needs both a decision ledger and a financial ledger, cleanly
separated.

## Decision

- Implement an **append-only double-entry financial ledger** in PostgreSQL (ADR-004).
  Order and portfolio tables are **not** the accounting ledger.
- Record: deposits, withdrawals, transfers, fills, trading fees, funding payments,
  borrowing, repayments, realized PnL, settlement, gas, bridge fees, prediction-market
  settlement.
- Each entry is immutable. Corrections happen via **compensating entries**, never by
  mutating a posted entry.
- Run scheduled **reconciliation** against venues and produce discrepancy reports; never
  silently alter accounting state to make reconciliation pass.
- Keep the **Decision Ledger** (ADR-001 spec §18) as a separate, queryable provenance
  store (strategy/model/risk/execution policy versions, features, signals, EV, confidence,
  outcome, counterfactual, attribution).

## Consequences

- `Decimal` accounting (ADR-002) is enforced at the ledger boundary.
- Discrepancies are first-class events surfaced to ops and the UI.
