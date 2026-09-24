# Architecture

## Boundaries

Sisera is a modular monorepo with independently deployable applications and framework-neutral domain
packages.

```text
apps/web  ────────┐
                  ├── apps/api ──┬── market-data providers
API clients ──────┘              ├── deterministic risk
                                 ├── OMS state machine
agents ── proposals only ────────┤
                                 └── PostgreSQL decision ledger
```

- `apps/web` is the public site and authenticated operator terminal.
- `apps/api` is the control plane. Identity, authorization, validation, telemetry, and execution
  policy live at this boundary.
- `packages/domain` owns versionable trading contracts. Monetary values cross boundaries as decimal
  strings.
- `packages/market-data` normalizes provider payloads and attaches explicit quality metadata.
- `packages/risk` is deterministic and side-effect free. It takes complete snapshots and returns a
  decision with machine-readable reasons.
- `packages/oms` owns legal order state transitions. Venue adapters cannot mutate state directly.
- `packages/copilot` compiles text into research queries or confirmable drafts; it never creates an
  executable command.
- `packages/agent-runtime` governs stage transitions and creates proposals only.
- `packages/db` defines the operational and append-only decision records.

## Core invariants

1. No order routes without an approved risk decision.
2. No execution uses a delayed, stale, degraded, or unavailable quote.
3. No LLM response is executable. Only validated domain commands may enter the order workflow.
4. No agent calls a venue adapter. Agents submit proposals to the control plane.
5. No missing live data is replaced by generated data.
6. Every execution decision retains actor, policy, portfolio, quote, and correlation provenance.

## Scaling path

The current API is a modular service, not a premature mesh. Split market ingestion, portfolio
reconciliation, execution gateways, and agent workers only when independent throughput or regulatory
boundaries justify it. Preserve contracts and idempotency keys when extracting a module.
