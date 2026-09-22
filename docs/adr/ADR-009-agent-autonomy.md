# ADR-009 — Agent autonomy

**Status:** Accepted
**Date:** 2026-09-22

## Context

V1 has no autonomous-agent runtime. V2 requires governed autonomy: agents that can research,
suggest, and (with permission) execute, but never with unrestricted account access.

## Decision

- Autonomy levels (spec §23): `RESEARCH`, `SUGGEST`, `CONFIRM`, `POLICY_AUTO`,
  `AUTONOMOUS`, `EMERGENCY_RISK_ONLY`.
- Every agent is assigned explicit **capital, instruments, venues, max leverage, max
  position, daily loss, drawdown, risk-per-trade, transaction limit, and approval
  requirements**.
- An agent **never** has unrestricted access merely because it holds wallet credentials.
- Agent lifecycle (spec §24): `DRAFT → BACKTEST → STRESS TEST → PAPER → SHADOW →
  LIMITED LIVE → LIVE`, with `DRAFT → LIVE` forbidden without a privileged, audit-logged
  override.
- Strategy manifests are schema-validated, versioned, and **immutable after deployment**
  (changes create a new version).

## Consequences

- Agent runtime is a first-class service (`services/agents`) consuming the same
  decision/risk/execution pipeline as human trades (ADR-008).
- Every autonomous action is attributable through the Decision Ledger.
