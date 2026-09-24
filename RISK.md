# SISERA V2 — RISK ENGINE SPECIFICATION

> **Institutional Multi-Tier Risk Governance**
> Pre-Trade Validation, Real-Time Portfolio Stress Testing, Circuit Breakers, and Emergency Kill Switch Procedures.

---

## 1. Principles & Governance

The Sisera Risk Engine operates under three absolute mandates:
1. **Deterministic Pre-Trade Gate**: Every order without exception must receive an explicit approval (`RiskCheckResult.approved == True`) from the pre-trade risk engine before entering the OMS routing pipeline.
2. **Sub-Millisecond Evaluation**: Risk limits are evaluated in-memory using pre-aggregated portfolio exposures and balanced double-entry accounting state.
3. **Fail-Closed Default**: In the presence of stale market data, network partitions, or database degradation, the risk engine immediately defaults to rejecting mutating orders and enforcing passive/liquidating modes.

---

## 2. Risk Check Hierarchy

```text
Order Request
     │
     ▼
[Layer 1: Identity & Authorization] ──── (Role, organization limits, trading permissions)
     │
     ▼
[Layer 2: Instrument & Fat-Finger]  ──── (Max single order size, price band vs mark price ±3%)
     │
     ▼
[Layer 3: Portfolio & Leverage]     ──── (Gross notional, net delta, max leverage e.g. 5x)
     │
     ▼
[Layer 4: Drawdown & PnL Guards]    ──── (Daily realized + unrealized drawdown limits e.g. 5%)
     │
     ▼
[Layer 5: Venue & Liquidity Limits] ──── (Max venue concentration, market participation rate)
     │
     ▼
Approval Granted → Advance OMS to ROUTING
```

---

## 3. Limit Definitions & Calculations

| Limit Category | Threshold Type | Formula / Check | Action on Breach |
|---|---|---|---|
| **Fat-Finger Guard** | Absolute Notional | `order.quantity * order.price <= limits.max_single_order_usd` | Immediate rejection (`FAT_FINGER_REJECT`) |
| **Price Collar** | Percentage Variance | `abs(order.price - mark_price) / mark_price <= limits.max_price_collar_pct` | Immediate rejection (`COLLAR_EXCEEDED`) |
| **Gross Leverage** | Portfolio Ratio | `(current_gross_exposure + order_notional) / equity <= limits.max_leverage` | Order rejected; margin warning alert |
| **Net Delta Exposure** | Asset Group Concentration | `abs(sum(asset_delta)) <= limits.max_asset_delta_usd` | Order rejected |
| **Daily Drawdown** | Percentage NAV Drop | `daily_loss / start_of_day_equity >= limits.max_daily_drawdown_pct` | Trip Portfolio Circuit Breaker |

---

## 4. Margin & Stress Testing Models

### Cross-Margin vs Isolated Margin
- Sisera supports cross-margin portfolio accounting with initial margin (IM) and maintenance margin (MM) computed continuously.
- Haircuts are applied dynamically depending on asset volatility regime (`LOW_VOL`: 5% haircut, `HIGH_VOL`: 25% haircut).

### Hypothetical Stress Scenarios
Simulated at interval or on-demand via `/api/v1/risk/stress-test`:
1. **Crypto Flash Crash**: BTC -20%, ETH -25%, Altcoins -40%, Funding +300%.
2. **Global Liquidity Squeeze**: Spreads widen 10x, venue order book depth drops 80%.
3. **De-Peg Event**: Stablecoins trade at $0.92, basis spreads invert.
4. **Macro Rate Shock**: Yield curve shifts +100 bps, FX vol doubles.

---

## 5. Circuit Breakers & Kill Switches

### Scope Hierarchy
The `CircuitBreaker` framework operates across four hierarchical scopes:
- `GLOBAL`: Halts all execution across all organizations and venues.
- `ORGANIZATION`: Halts all activity for an institutional entity.
- `PORTFOLIO`: Cancels open orders and halts trading for a specific portfolio.
- `INSTRUMENT`: Suspends trading on a specific symbol (e.g. during an exchange outage).
- `AGENT`: Terminates or pauses an autonomous agent instance.

### Operational Modes
- `NORMAL`: All allowed trading actions permitted.
- `REDUCE_ONLY`: Only orders that strictly decrease open exposure are accepted.
- `PASSIVE_ONLY`: No aggressive market orders permitted; only post-only limit orders.
- `FULL_HALT`: No orders accepted; all existing working orders systematically cancelled.

### Kill Switch Trip & Reset Workflow
1. **Trip**: Executed programmatically by the background risk watchdog or manually by an authorized Risk Officer via web terminal or mobile app.
2. **Audit Logging**: Actor ID, exact timestamp, cryptographic trace, and rationale recorded in the immutable audit ledger.
3. **Recovery**: Clearing a tripped kill switch requires two-man rule confirmation (or explicit operator credentials) accompanied by verified balance reconciliation.
