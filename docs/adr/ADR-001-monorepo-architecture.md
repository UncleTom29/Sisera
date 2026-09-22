# ADR-001 — Monorepo architecture

**Status:** Accepted
**Date:** 2026-09-22

## Context

Sisera V2 must span a Python quant/services backend, a web terminal, a mobile app, venue
connectors, and shared schemas/domain types. The V1 repo is a single Python package
(`sisera/`) plus a static web UI.

## Decision

Migrate to a single monorepo:

```text
apps/            web, mobile
services/        api, auth, market-data, instrument-master, portfolio, risk, oms,
                 execution, agents, intelligence, notifications, ledger
packages/        domain, api-client, schemas, ui, config, observability
quant/           indicators, intelligence, scoring, opportunity, strategies, backtesting,
                 attribution, optimization, research
connectors/      exchanges, dex, prediction, market-data, macro, news, wallets
workers/         scanner, market-data, risk-monitor, agent-runtime, settlement, analytics
infra/           docker, terraform, helm, monitoring
tests/           unit, integration, contract, replay, e2e, security
docs/            adr, connectors, operations
```

## Consequences

- **Avoid premature microservice fragmentation.** Services are designed for independent
  deployment but share a local development profile (Docker Compose) and can initially run
  in a smaller number of processes.
- The V1 `sisera/` package is migrated module-by-module per the mapping in §56 of the
  product spec (no wholesale rewrite; working tests are preserved).
- Cross-language shared types live in `packages/schemas` and generate the TS client used by
  `apps/web` and `apps/mobile`.

## Deviation note

The exact directory layout may shift for a strong technical reason; any such shift must be
recorded as a new ADR.
