# SISERA V2 — ORDER MANAGEMENT & EXECUTION SPECIFICATION

> **Order State Machine, Smart Order Routing (SOR), Algorithms, and Transaction Cost Analysis (TCA)**

---

## 1. Order Management System (OMS)

The Sisera OMS enforces an idempotent, deterministic 17-state finite state machine.

### State Transition Diagram
```text
                    ┌──────────────┐
                    │   CREATED    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  VALIDATING  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐      Risk Fail      ┌────────────────┐
                    │  RISK_CHECK  ├────────────────────►│ RISK_REJECTED  │
                    └──────┬───────┘                     └────────────────┘
                           │ Risk Approved
                           ▼
                    ┌──────────────────────┐
                    │   APPROVAL_PENDING   │ (Optional if policy requires 4-eyes)
                    └──────┬───────────────┘
                           │ Approved
                           ▼
                    ┌──────────────┐
                    │   APPROVED   │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │   ROUTING    │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │  SUBMITTING  │
                    └──────┬───────┘
                           │
                           ▼
                    ┌──────────────┐
                    │ ACKNOWLEDGED │
                    └──────┬───────┘
                           │
         ┌─────────────────┼─────────────────┐
         ▼                                   ▼
┌──────────────────┐               ┌──────────────────┐
│ PARTIALLY_FILLED │               │      FILLED      │
└────────┬─────────┘               └──────────────────┘
         │                                   ▲
         └───────────────────────────────────┘
```

### Complete State Catalog
1. `CREATED`: Initial memory allocation and client request parsing.
2. `VALIDATING`: Syntactic schema validation and instrument verification.
3. `RISK_CHECK`: Pre-trade risk policy and margin limit evaluation.
4. `RISK_REJECTED`: Terminal state if pre-trade risk fails.
5. `APPROVAL_PENDING`: Awaiting human supervisor approval (for high notional trades).
6. `APPROVED`: Human authorization granted.
7. `ROUTING`: Smart Order Router slicing parent order into child execution legs.
8. `SUBMITTING`: Slices dispatched to venue adapters.
9. `ACKNOWLEDGED`: Exchange / venue confirms receipt of order.
10. `PARTIALLY_FILLED`: Cumulative fill quantity > 0, but < target quantity.
11. `FILLED`: 100% of order quantity executed. Terminal state.
12. `CANCEL_PENDING`: Cancellation instruction dispatched to venue.
13. `CANCELLED`: Order cancelled by user, risk engine, or kill switch. Terminal state.
14. `REJECTED`: Order rejected by external venue. Terminal state.
15. `EXPIRED`: Time-in-force (e.g. Day, IOC, FOK) elapsed without fill.
16. `UNKNOWN`: Connectivity anomaly; reconciling with exchange state.

---

## 2. Smart Order Routing (SOR)

The Sisera Smart Order Router dynamically optimizes execution quality across fragmented liquidity venues:
1. **Liquidity Aggregation**: Aggregates top-of-book depth across centralized exchanges (Binance, Bybit, OKX, Coinbase), decentralized exchanges (Hyperliquid, dYdX, Uniswap v3/v4), and prediction markets (Polymarket).
2. **Maker-First Slicing**:
   - Posts passive limit orders inside the bid-ask spread to capture maker rebates where fee tiers are advantageous.
   - Automatically cancels and shifts to aggressive sweeps when urgency thresholds or execution deadlines are approached.
3. **Execution Algorithms**:
   - **TWAP (Time-Weighted Average Price)**: Slices large orders uniformly over a specified duration with randomized interval jitter (±15%) to minimize footprint.
   - **VWAP (Volume-Weighted Average Price)**: Allocates slice sizes according to historical and intraday volume profiles.
   - **Iceberg / Hidden**: Discloses small display sizes while queuing the remaining balance in memory.

---

## 3. Transaction Cost Analysis (TCA)

Every executed fill undergoes immediate Transaction Cost Analysis to quantify execution efficiency against benchmark prices:

```text
Implementation Shortfall (bps) = ((Arrival Price - Execution Price) / Arrival Price) * 10,000 * Side
```

### Metric Definitions
- **Arrival Price**: The mid-market price at the exact millisecond the order was received by the OMS.
- **Implementation Shortfall (IS)**: Total slippage + fees relative to arrival price.
- **Spread Capture**: Percentage of the prevailing bid-ask spread captured through passive execution.
- **Market Impact (bps)**: Price movement observed 100ms, 1s, and 10s following order fill.
- **Venue Toxicity**: Frequency with which adverse price moves occur immediately following fills on a specific venue.
