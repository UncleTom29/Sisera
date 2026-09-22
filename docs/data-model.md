# Sisera Data Model

Canonical domain model implemented in `packages/domain` (`sisera_domain`). All financial
amounts use `decimal.Decimal` (ADR-002); every value object is immutable (`frozen=True`).

## Value objects (`sisera_domain.money`)

| Type | Meaning | Invariants |
|---|---|---|
| `Asset` | Currency/token/unit code | Normalized uppercase; non-empty |
| `Money` | `amount` + `Asset` | Arithmetic requires matching asset; exact Decimal |
| `Quantity` | signed `value` + `Asset` (unit) | Add/sub require matching unit |
| `Price` | quote per base (`base`/`quote` `Asset`) | `Price * Quantity(base) -> Money(quote)`; cross-pairing comparison raises |
| `Percentage` | fractional ratio (0.01 == 1%) | `from_percent`, `of(money)` |

Quantization: `quantize_to_step` / `round_quantity_to_lot` round **toward zero** (never
over-fill), applied against instrument tick/lot metadata.

## Instrument Master (`sisera_domain.instrument`)

- `CanonicalAsset` — the economic asset (`asset_id`, `symbol`, `name`, `asset_class`, …).
- `VenueInstrument` — a venue's listing, referencing a `canonical_asset_id`.
- `Instrument` — the canonical tradable instrument with the full spec §8 field set
  (type, base/quote/settlement asset, venue, chain, contract, multiplier, tick/lot size,
  precision, expiry, strike, option type, funding/margin model, oracle, collateral,
  jurisdiction, status).
- `InstrumentType`: `SPOT`, `PERPETUAL`, `FUTURE`, `OPTION`, `TOKENIZED_EQUITY`,
  `TOKENIZED_FUND`, `RWA`, `FX`, `COMMODITY`, `INDEX`, `PREDICTION_BINARY`,
  `PREDICTION_MULTI_OUTCOME`, `PREDICTION_SCALAR`.
- `SymbolResolver` resolves registered aliases/tickers to canonical assets; **never**
  infers an instrument from a bare ticker.

## Orders / OMS (`sisera_domain.order`, `sisera_domain.oms`)

- `Order` — immutable aggregate: ids, side, type, quantity, price, TIF, reduce-only,
  state, filled qty, avg fill, fee, sources (user/strategy/agent), risk/approval ids,
  lifecycle.
- `OrderState` — 16-state machine (spec §12) with terminal states and validated
  transitions (`OrderStateMachine`, `transition_order`).
- `OrderManager` — idempotent store keyed by `client_order_id`; duplicate submissions
  return the existing order (no double-trade).

## Execution (`sisera_domain.execution`)

- `VenueAdapter` — generic venue protocol (spec §10) with `VenueCapabilities` flags.
- `PaperExecutionEngine` — deterministic paper simulator: spread, maker/taker fees,
  partial fills against depth; resting orders do not fill.

## Portfolio & Risk (`sisera_domain.portfolio`, `sisera_domain.risk`, `sisera_domain.stress`)

- `Position` — side, quantity, entry/mark, margin, leverage, `beta_map`.
- `Portfolio` — hierarchical (`parent_id`); computed equity, gross/net exposure, leverage,
  margin, concentration, drawdown.
- `RiskEngine` / `RiskPolicy` / `RiskCheckResult` — deterministic pre-trade checks with
  reason codes (size, exposure, leverage, concentration, margin, drawdown, stale data).
- `StressEngine` / `Scenario` — factor-shock scenarios, impact by instrument/factor.

## Routing (`sisera_domain.routing`)

- `SmartOrderRouter` — cost-based routing (impact + slippage + fee + gas + bridge +
  adverse selection + funding + latency + failure + counterparty); venue exclusions,
  preferences, health, liquidity/slippage/latency/gas limits; depth-based splitting.

## Ledgers (`sisera_domain.ledger`, `sisera_domain.decision`)

- **Financial ledger** — `LedgerEntry`/`Posting`/`Ledger`: append-only double-entry,
  per-asset balanced, immutable; compensating corrections; per-(account, asset) balances.
  `EntryType` covers deposits, withdrawals, transfers, fills, fees, funding, borrow/repay,
  realized PnL, settlement, gas, bridge, prediction settlement.
- **Decision ledger** — `Decision`/`DecisionLedger`: queryable provenance (versions,
  features, signal components, EV/confidence/uncertainty, reason codes, plans, fills,
  outcome, counterfactual, attribution).

## Analytics (`sisera_domain.tca`)

- `TCAEngine` / `FillRecord` — slippage, implementation shortfall (timing + execution
  decomposition), fee bps, fill ratio, markout, maker ratio.

## Prediction markets (`sisera_domain.prediction`)

- `PredictionEvent` / `PredictionMarket` / `PredictionOutcome` / `ResolutionRule` /
  `ResolutionOracle` / `PredictionPosition` / `PredictionSettlement`; binary/multi/scalar;
  probability range validation; settlement payout.

## Agents (`sisera_domain.agent`)

- `AutonomyLevel` (`RESEARCH`…`EMERGENCY_RISK_ONLY`), `LifecycleStage`
  (`DRAFT`…`LIVE` with `DRAFT→LIVE` gated), `AgentCapital` limits, `StrategyManifest`
  (versioned, immutable), `Agent`.

## Institutional controls (`sisera_domain.approval`, `.circuit`, `.reconcile`, `.intent`, `.auth`)

- **Approvals** — `ApprovalPolicy`/`ApprovalRule` (four-eyes, role/count), auditable
  `Approval` records, `ApprovalEngine` evaluation.
- **Kill switches** — `CircuitBreaker` with hierarchical `KillScope` and `EmergencyMode`;
  global trips block all.
- **Reconciliation** — `Reconciler` venue-vs-ledger discrepancy events (never silently fixes).
- **Intent compiler** — `TradeIntent` schema + `compile_intent` validation; data only,
  no execution authority.
- **RBAC** — `Organization`/`Desk`/`User`/`Membership`, `Role`/`Permission` map,
  deterministic `AccessPolicy`.

## Event schemas (`packages/schemas`)

- `EventHeader` (timestamps, source, instrument, `DataQuality`, sequence, correlation id)
  and market-data + order-lifecycle event DTOs for the NATS bus (ADR-003).
