# SISERA V2 — COMPLETE API REFERENCE

> **Version:** `1.0.0`
> **Base URL:** `http://localhost:8000/api/v1` (or configured `SISERA_API_URL`)
> **Authentication:** Bearer token via Privy JWT or `SISERA_DEV_TOKEN` in development mode.

---

## 1. Authentication & System Health

### GET `/health`
Returns the operational status of the Sisera API and dependent subsystems.

```bash
curl -X GET "http://localhost:8000/api/v1/health"
```

**Response (200 OK):**
```json
{
  "status": "ok",
  "version": "2.0.0",
  "environment": "dev",
  "timestamp": 1727145000000
}
```

### GET `/auth/me`
Returns details and permissions for the authenticated identity.

```bash
curl -X GET "http://localhost:8000/api/v1/auth/me" \
  -H "Authorization: Bearer <token>"
```

**Response (200 OK):**
```json
{
  "user_id": "usr_privy_0912",
  "email": "trader@firm.com",
  "role": "TRADER",
  "organization_id": "org_institutional",
  "permissions": ["orders:create", "orders:cancel", "copilot:query"]
}
```

---

## 2. Market Data & Derivatives

### GET `/markets`
Lists all active market tickers with 24-hour statistics and data-quality status.

```bash
curl -X GET "http://localhost:8000/api/v1/markets"
```

**Response (200 OK):**
```json
[
  {
    "symbol": "BTCUSDT",
    "instrument_id": "binance:BTC/USDT:spot",
    "base_asset": "BTC",
    "quote_asset": "USDT",
    "venue": "binance",
    "instrument_type": "SPOT",
    "last_price": "63420.50",
    "bid": "63420.00",
    "ask": "63421.00",
    "change_24h_pct": "2.45",
    "volume_24h": "1420500000",
    "funding_rate": "0.000100",
    "open_interest": "854000000",
    "quality_status": "LIVE",
    "status_timestamp_ms": 1727145000000
  }
]
```

### GET `/markets/{symbol}/orderbook?depth=10`
Returns top-of-book depth with balanced bids and asks.

```bash
curl -X GET "http://localhost:8000/api/v1/markets/BTCUSDT/orderbook?depth=5"
```

**Response (200 OK):**
```json
{
  "symbol": "BTCUSDT",
  "timestamp_ms": 1727145000000,
  "bids": [
    {"price": "63420.00", "quantity": "1.250", "order_count": 4},
    {"price": "63419.50", "quantity": "3.800", "order_count": 8}
  ],
  "asks": [
    {"price": "63421.00", "quantity": "0.850", "order_count": 2},
    {"price": "63421.50", "quantity": "2.100", "order_count": 5}
  ]
}
```

### GET `/markets/{symbol}/candles?interval=1h&limit=48`
Returns historical OHLCV candles formatted for financial charting.

---

## 3. Order Management & Route Preview

### POST `/orders/preview`
Calculates comprehensive pre-trade route and risk preview without placing an order.

```bash
curl -X POST "http://localhost:8000/api/v1/orders/preview" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "instrument_id": "BTCUSDT",
    "side": "BUY",
    "order_type": "LIMIT",
    "quantity": "0.5",
    "price": "63420.00",
    "portfolio_id": "pf_1",
    "account_id": "acc_main"
  }'
```

**Response (200 OK):**
```json
{
  "instrument_id": "BTCUSDT",
  "side": "BUY",
  "order_type": "LIMIT",
  "quantity": "0.5",
  "estimated_fill_price": "63420.00",
  "estimated_notional": "31710.00",
  "estimated_fees": "6.34",
  "estimated_slippage_bps": "1.20",
  "estimated_gas": "0.00",
  "estimated_funding_impact": "0.00",
  "resulting_exposure": "31710.00",
  "resulting_leverage": "0.31",
  "margin_impact": "3171.00",
  "liquidation_estimate": null,
  "risk_check": {
    "approved": true,
    "reasons": []
  },
  "route_plan": {
    "decision": "SOR BINANCE_PRIMARY",
    "legs": [
      {
        "venue": "binance",
        "slice_quantity": "0.5",
        "order_type": "LIMIT",
        "expected_slippage_bps": "1.20"
      }
    ]
  }
}
```

### POST `/orders`
Creates a new order in the Order Management System. Validates format and checks pre-trade risk.

```bash
curl -X POST "http://localhost:8000/api/v1/orders" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "client_order_id": "client_order_9981",
    "instrument_id": "BTCUSDT",
    "side": "BUY",
    "order_type": "LIMIT",
    "quantity": "0.25",
    "price": "63400.00",
    "account_id": "acc_main",
    "portfolio_id": "pf_1"
  }'
```

### POST `/orders/{id}/execute`
Fills the order in paper or live mode, executes through the Smart Order Router, writes balanced double-entry ledger postings, and computes Transaction Cost Analysis (TCA).

---

## 4. Positions & Portfolio

### GET `/positions?portfolio_id=pf_1`
Lists all open positions with unrealized PnL, mark price, and entry price.

### POST `/positions/{instrument_id}/close`
Closes an open position by submitting an offsetting market order.

### GET `/portfolios/{id}`
Returns portfolio equity, cash, margin, and current leverage.

---

## 5. Risk Engine & Circuit Breakers

### POST `/risk/check`
Evaluates whether a proposed trade complies with all risk policies (notional limit, leverage cap, daily drawdown).

### POST `/risk/stress-test`
Simulates portfolio PnL impact under extreme historical and hypothetical market stress scenarios.

### POST `/risk/kill-switch/trip`
Trips a circuit breaker or kill switch.

```bash
curl -X POST "http://localhost:8000/api/v1/risk/kill-switch/trip" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "scope": "PORTFOLIO",
    "reason": "Market anomaly detected",
    "scope_id": "pf_1"
  }'
```

### POST `/risk/kill-switch/clear`
Clears a previously tripped kill switch (requires authorized role).

---

## 6. Intelligence & Copilot

### POST `/intelligence/copilot`
Queries the Sisera Copilot for market insight, regime status, or portfolio analytics.

```bash
curl -X POST "http://localhost:8000/api/v1/intelligence/copilot" \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "question": "What is our current BTC beta exposure?",
    "portfolio_id": "pf_1"
  }'
```

### POST `/intelligence/intent`
Compiles natural language instructions into structured, schema-validated execution plans.

### GET `/intelligence/differential?symbol=BTC-PERP`
Returns real-time differential factor changes across funding, open interest, volatility, and order book imbalance.

### POST `/intelligence/memory`
Queries market memory for similar historical regimes and trade outcomes.

---

## 7. Autonomous Agents

### GET `/agents`
Lists all registered autonomous trading agents and their performance metrics.

### POST `/agents`
Registers a new autonomous agent from a declarative YAML manifest.

### POST `/agents/{id}/pause`
Pauses an agent's active execution loop.

### POST `/agents/{id}/resume`
Resumes an agent.

---

## 8. Analytics & Post-Trade Ledger

### GET `/analytics/tca`
Returns Transaction Cost Analysis for historical fills: implementation shortfall, spread capture, market impact bps.

### GET `/ledger/decisions`
Queries the immutable audit ledger of trading decisions, model inputs, and operator approvals.
