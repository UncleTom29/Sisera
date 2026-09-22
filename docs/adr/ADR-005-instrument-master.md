# ADR-005 — Instrument Master

**Status:** Accepted
**Date:** 2026-09-22

## Context

V1 is hardwired to Bybit USDT linear perpetuals and infers instruments from ticker strings
(`BTCUSDT`). V2 is multi-asset, multi-venue: spot, perps, dated futures, options,
tokenized equities/funds, RWAs, FX, commodities, indices, and prediction markets. Ticker
strings are not a reliable identity and cannot carry contract metadata.

## Decision

- Implement a canonical **Instrument Master** before adding venues.
- Separate **`CanonicalAsset`** (the economic asset, e.g. BTC) from **`VenueInstrument`**
  (a specific venue's listing). BTC spot on two exchanges maps to one canonical asset but
  two venue instruments.
- `Instrument` carries the full field set from the spec §8 (instrument_type, base/quote/
  settlement asset, venue, chain, contract_address, multiplier, tick/lot size, precision,
  expiry, strike, option_type, funding/margin model, oracle, collateral rules, jurisdiction
  tags, status, metadata).
- Support symbol-resolution and aliasing. **Never infer an instrument from a bare ticker.**
- `instrument_type` enumerates `SPOT`, `PERPETUAL`, `FUTURE`, `OPTION`,
  `TOKENIZED_EQUITY`, `TOKENIZED_FUND`, `RWA`, `FX`, `COMMODITY`, `INDEX`,
  `PREDICTION_BINARY`, `PREDICTION_MULTI_OUTCOME`, `PREDICTION_SCALAR`.

## Consequences

- Bybit's `BybitInstrument`/`Ticker`/`OrderBook` models are migrated behind this master;
  the rest of Sisera operates only on canonical `Instrument`/`CanonicalAsset`.
- New venues (Hyperliquid, additional CEX, DEX aggregators, prediction venues) are added
  as `VenueInstrument` providers without touching the core domain.
