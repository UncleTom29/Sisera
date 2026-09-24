# SISERA V2 — PREDICTION MARKETS & EVENT HEDGING

> **Institutional Prediction Market Architecture, Conditional Tokens Framework (CTF), CLOB Routing, and Cross-Asset Hedging**

---

## 1. Overview & Institutional Rationale

Prediction markets (e.g. Polymarket, Kalshi) provide continuous, probabilistic pricing of discrete real-world macro, regulatory, and financial events. Sisera treats prediction markets as first-class financial instruments, enabling:
1. **Direct Speculation & Market Making**: Providing passive liquidity on high-volume prediction order books.
2. **Cross-Asset Event Hedging**: Hedging macro tail risks (e.g. regulatory approvals, rate decisions, election outcomes) that directly impact spot or derivative exposures.
3. **Information Discovery**: Extracting market-implied probabilities to calibrate quantitative volatility surfaces and differential factor engines.

---

## 2. Instrument & Data Model

Prediction market contracts are represented via canonical `Instrument` records in the Instrument Master:
- `PREDICTION_BINARY`: Binary outcomes resolving to 0.00 or 1.00 (e.g. "Will SEC approve ETF before Q3?").
- `PREDICTION_MULTI_OUTCOME`: Mutually exclusive categorical outcomes where `sum(P(outcome_i)) == 1.00`.
- `PREDICTION_SCALAR`: Bounded ranges resolving to continuous values.

### Settlement & Oracle Architecture
- **Oracles**: UMA Optimistic Oracle, Chainlink, or verified government publication feeds (BLS, Federal Reserve).
- **Resolution Verification**: Automated dual-oracle reconciliation with manual disputes handling.

---

## 3. Cross-Asset Hedging Mechanics

### Delta & Macro Event Sensitivity
When an institutional portfolio holds substantial long exposure to an underlying asset (e.g. $10,000,000 long ETH), it is susceptible to regulatory or macro catalysts.

```text
Event: "Will SEC classify Token X as security before December 31?"
Implied Probability: P(YES) = 0.35 (Price: $0.35)

Hedging Equation:
Hedge Notional = Portfolio Delta * Correlation Factor * Expected Drawdown Given Event
```

### Execution Strategy
1. **Conditional Token Purchase**: Buying binary outcome tokens to offset underlying portfolio downside.
2. **Dynamic De-Risking**: As implied event probability rises on Polymarket, the differential factor engine automatically triggers delta rebalancing in perpetual futures.
3. **Payoff Convergence**: On resolution, binary payout compensates realized drawdown in the underlying asset, preserving Net Asset Value (NAV).

---

## 4. Liquidity & Order Routing

- **Polymarket CLOB Connector**: Interacts with the Polymarket CTF Exchange on Polygon / Ethereum L2 via signed EIP-712 orders.
- **Kalshi API**: Direct institutional FIX / REST integration for CFTC-regulated event contracts.
- **Gas & Settlement Optimization**: Batched token approvals and automated redemption of winning conditional tokens.
