# ADR-010 — Market data quality

**Status:** Accepted
**Date:** 2026-09-22

## Context

V1 silently falls back to synthetic/plausible fake data (`_BASE_PRICES`, synthetic OHLCV/
orderbook/ticker generators) whenever a live fetch fails, making fake data indistinguishable
from real data to callers. This violates the core principle that every live number must
have provenance.

## Decision

- Normalized market-data layer with canonical event types (`TradeTick`, `BestBidAsk`,
  `OrderBookDelta`, `OrderBookSnapshot`, `Candle`, `FundingUpdate`,
  `OpenInterestUpdate`, `LiquidationEvent`, `OptionGreeksUpdate`,
  `ReferencePriceUpdate`, `PredictionPriceUpdate`, `NewsEvent`, `MacroEvent`).
- Every event carries: timestamp, source timestamp, ingestion timestamp, source,
  instrument ID, quality status, and sequence information where available.
- Quality states: `LIVE`, `DELAYED`, `STALE`, `DEGRADED`, `UNAVAILABLE`.
- **Never replace unavailable live data with hardcoded plausible numbers in production.**
  If data is unavailable, return `null`, an explicit status, or last-known-value plus its
  timestamp (where policy allows). The UI must visibly distinguish stale/delayed data.
- Connectors are classified `PRODUCTION_READY`, `SANDBOX_VERIFIED`, `PAPER_ONLY`,
  `EXPERIMENTAL`, `DISABLED`, and that status is exposed.

## Consequences

- The synthetic fallback path in `sisera/data/bybit.py` is removed from production code and
  re-homed as explicit, clearly-labelled **fixtures/mocks** used only by tests and paper
  trading.
- Venue adapters implement capability flags and health/degraded states (spec §10, §49).
