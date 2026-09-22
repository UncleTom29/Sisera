# ADR-002 — Financial data types

**Status:** Accepted
**Date:** 2026-09-22

## Context

V1 uses binary floating-point (`float`) for monetary balances, prices, quantities, fees,
PnL, and margin. Floating point cannot represent most decimal fractions exactly, which
produces cumulative accounting error and makes exact reconciliation impossible.

## Decision

- **Canonical financial amounts** (balances, quantities, fees, ledger amounts, and any
  price requiring exact accounting) are represented with `Decimal` (fixed-point), never
  `float`.
- **Market/tick prices** that are informational (charting, analytics, indicators) may use
  `float` internally for performance, but are converted to a canonical representation at
  any domain/ledger boundary.
- Define canonical value objects in `packages/domain` (e.g. `Money`, `Quantity`, `Price`,
  `Percentage`) that carry both the amount and its currency/asset + precision, and reject
  mixing incompatible units at the type boundary.
- Quantization (tick size, lot size, price/quantity precision) is applied against the
  Instrument Master metadata before any order is constructed.

## Consequences

- The V1 `Position`/`PortfolioState`/`Opportunity` float fields are migrated to these types
  as they move into the canonical domain.
- The financial ledger (ADR-007) is `Decimal`-native from day one.
- Serialization boundaries (Pydantic schemas, JSON) must be explicit about
  decimal-vs-float, using string or scaled-integer encodings where exactness matters.
