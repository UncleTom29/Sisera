# SISERA V2 — ARCHITECTURE SPECIFICATION

> **Institutional Multi-Asset Trading Operating System**
> Production Reference Architecture, Service Catalog, Invariants, and Deployment Topology.

---

## 1. System Vision & Paradigm

Sisera is an institutional-grade, multi-asset trading OS integrating:
1. Multi-asset market intelligence across Crypto, FX, Equities, Commodities, and Prediction Markets.
2. Deterministic execution guarded by hard pre-trade risk controls and double-entry accounting.
3. Quant models, regime detection, differential factor tracking, and market memory.
4. Autonomous agent lifecycle management with deterministic policy boundaries.
5. High-fidelity decision provenance and Transaction Cost Analysis (TCA).

### The Core Intelligence Pipeline
```text
Observe → Understand → Predict → Decide → Optimize → Execute → Reassess → Learn
```

---

## 2. Invariants & Hard Rules

1. **Non-Bypassable Risk Controls**: No trade or order can ever reach a venue adapter or exchange without executing through the pre-trade risk engine and the policy engine.
2. **LLM Execution Isolation (ADR-008)**:
   - LLMs research, summarize, reason, explain, propose trade plans, and generate typed intents.
   - LLMs **never** directly place trades, approve risk exceptions, mutate capital limits, or execute venue orders.
   - Intent compilers parse natural language into schema-validated `TradeIntent` structures that are subsequently evaluated by deterministic policy engines.
3. **Canonical Financial Accounting (ADR-002 & ADR-007)**:
   - Floating-point arithmetic (`float` / IEEE 754) is strictly forbidden for prices, quantities, balances, margins, fees, PnL, and ledger entries.
   - All balance updates record as balanced, append-only double-entry transactions (`sum(postings) == 0`).
4. **Instrument Disambiguation (ADR-005)**:
   - Bare tickers (e.g. `BTC`) are never used for execution. Every instrument is uniquely identified by `instrument_id` (e.g., `binance:BTC/USDT:spot`, `hyperliquid:BTC-USD:perpetual`, `polymarket:0xabc:binary`).
5. **Fail-Closed Default**:
   - Live trading is disabled by default (`SISERA_LIVE_TRADING_ENABLED=false`).
   - Stale data quality (`STALE`, `DEGRADED`, `UNAVAILABLE`) immediately rejects market orders and halts passive quoting.

---

## 3. High-Level System Architecture Diagram

```text
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             CLIENT PRESENTATION TIER                             │
│                                                                                  │
│   Web Terminal (Next.js 14 / TypeScript)       Mobile Terminal (Expo / React Native)│
│   - Lightweight Charts / Order Book / Tape     - NAV / Risk State / Actionable Card│
│   - Unified Ticket + Live Preview (Route/Risk) - Mobile Order Ticket + Quick Sizes │
│   - Copilot Drawer + Intent Compiler           - Mobile Copilot + Emergency Kill   │
└──────────────────────────────▲───────────────────────────▲───────────────────────┘
                               │ JSON / WebSocket          │
                               ▼                           ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           API GATEWAY & AUTHENTICATION                           │
│                                                                                  │
│   FastAPI Gateway (/api/v1)                                                      │
│   - Privy JWT / Session Verification (Ed25519 JWKS)                              │
│   - Role-Based Access Control (Admin, Risk, Trader, Viewer, Auditor)             │
│   - Organization Multi-Tenancy & Rate Limiting                                   │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│ MARKET DATA SVC │           │ INTELLIGENCE &  │           │   ORDER & RISK  │
│                 │           │ AGENTS PIPELINE │           │    CORE (OMS)   │
│ - Tickers & OB  │           │ - Market Memory │           │ - State Machine │
│ - Candles (1m)  │           │ - Differential  │           │ - Route Preview │
│ - Derivatives   │           │ - Intent Comp.  │           │ - Pre-Trade Risk│
│ - Data Quality  │           │ - Agent Runtime │           │ - Double Entry  │
└────────┬────────┘           └────────┬────────┘           └────────┬────────┘
         │                             │                             │
         └──────────────────────┐      │      ┌──────────────────────┘
                                ▼      ▼      ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                            DURABLE NATS JETSTREAM BUS                            │
│                                                                                  │
│   Topics:                                                                        │
│   - sisera.market.*    - sisera.orders.*     - sisera.risk.*                     │
│   - sisera.fills.*     - sisera.agents.*     - sisera.alerts.*                   │
└──────────────────────────────────────┬───────────────────────────────────────────┘
                                       │
         ┌─────────────────────────────┼─────────────────────────────┐
         ▼                             ▼                             ▼
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│ EXECUTION & SOR │           │ POST-TRADE &    │           │ PERSISTENCE &   │
│                 │           │ AUDIT LEDGER    │           │ TIME-SERIES     │
│ - Smart Router  │           │ - Double-Entry  │           │ - PostgreSQL 16 │
│ - TWAP / VWAP   │           │ - Decision Prov.│           │ - TimescaleDB   │
│ - Maker-First   │           │ - TCA Engine    │           │ - ClickHouse    │
│ - Venue Adapt.  │           │ - Kill Switches │           │ - Redis Cache   │
└────────┬────────┘           └─────────────────┘           └─────────────────┘
         │
         ▼
┌──────────────────────────────────────────────────────────────────────────────────┐
│                             EXTERNAL VENUE CONNECTORS                            │
│                                                                                  │
│   CEX: Binance, Bybit, OKX, Coinbase, Deribit                                    │
│   DEX: Hyperliquid, dYdX, Uniswap v3/v4, Raydium, Aerodrome                      │
│   Prediction Markets: Polymarket (CTF Exchange), Kalshi, Hedgehog                │
└──────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Service Catalog

| Service | Directory | Responsibilities |
|---|---|---|
| **API Gateway** | `services/api` | Fast, typed REST + WebSocket interface (`/api/v1`). Authentication, routing, request validation. |
| **Auth Service** | `services/auth` | Privy integration, JWT verification via JWKS, organization multi-tenancy, RBAC policy. |
| **Order Management (OMS)** | `services/oms` | 17-state deterministic lifecycle, parent/child slices, state transitions, cancel guards. |
| **Risk Engine** | `services/risk` | Pre-trade risk checks, margin models, circuit breakers, kill switch trip/clear logic. |
| **Execution Engine & SOR** | `services/execution` | Smart order routing across venues, liquidity aggregation, maker-first routing, TWAP/VWAP. |
| **Market Data Service** | `services/market-data` | Ticker aggregation, order book normalization, candle generation, data quality stamping. |
| **Intelligence Service** | `services/intelligence` | Market memory vector store, differential factor engine, natural language intent compiler. |
| **Agents Engine** | `services/agents` | Manifest parsing, agent lifecycle stages (Draft → Live), runtime sandboxing, guardrails. |
| **Financial Ledger** | `services/ledger` | Double-entry balanced journal, decision provenance logging, balance sheets, audit trail. |
| **Notification Service** | `services/notifications` | Priority alerting (CRITICAL, WARNING, INFO), push notifications, Slack/Telegram hooks. |

---

## 5. Event Bus Topology & Schemas (NATS JetStream)

Every event emitted on the Sisera event bus adheres to the canonical cloud-event envelope:
```json
{
  "id": "evt_01J9...",
  "type": "sisera.orders.state_changed",
  "source": "services.oms",
  "timestamp": 1727145000000,
  "correlation_id": "req_88f9a...",
  "data": {
    "sisera_order_id": "ord_102934",
    "previous_state": "RISK_CHECK",
    "current_state": "ROUTING",
    "portfolio_id": "pf_1",
    "instrument_id": "binance:BTC/USDT:spot"
  }
}
```

### Core Event Topics
- `sisera.market.ticker.*`: Real-time normalized ticks stamped with data quality (`LIVE`, `DELAYED`, `STALE`).
- `sisera.orders.submitted`: Inbound order request received and validated.
- `sisera.orders.state_changed`: OMS state transition emitted.
- `sisera.execution.fill`: Fill executed by venue adapter, ready for ledger posting and TCA.
- `sisera.risk.breach`: Pre-trade or post-trade limit violated.
- `sisera.risk.kill_switch`: Circuit breaker tripped or cleared.
- `sisera.intelligence.regime_changed`: Differential engine detected macro/volatility regime switch.

---

## 6. Monorepo Structure

```text
├── apps/
│   ├── web/                     # Institutional Trading Terminal (Next.js 14)
│   └── mobile/                  # Mobile Companion App (Expo / React Native)
├── services/
│   ├── api/                     # Unified Versioned HTTP Gateway
│   ├── auth/                    # Privy Auth & RBAC
│   ├── oms/                     # Order State Machine
│   ├── risk/                    # Pre-Trade & Real-Time Risk
│   ├── execution/               # Smart Order Router & Execution Slices
│   ├── market-data/             # Feed Handlers & Quality Guards
│   ├── intelligence/            # Memory, Differential, Intent Compiler
│   ├── agents/                  # Autonomous Agents Engine
│   └── ledger/                  # Double-Entry Ledger & Decision Provenance
├── packages/
│   ├── domain/                  # Pure Core Entities & Decimal Logic
│   ├── api-client/              # Full-Featured TypeScript Client
│   ├── ui/                      # Design Tokens, Formatting Primitives
│   ├── schemas/                 # Pydantic & JSON Schemas
│   └── observability/           # OpenTelemetry Tracing & Metrics
├── quant/
│   ├── indicators/              # Quantitative Signal Calculators
│   ├── scoring/                 # Opportunity Scoring
│   └── backtesting/             # Event-Driven Historical Simulation
├── connectors/
│   ├── ccxt/                    # Unified Exchange Connectors
│   ├── hyperliquid/             # Hyperliquid L1 Connector
│   ├── polymarket/              # Polymarket CTF & CLOB Connector
│   └── dex-evm/                 # EVM DEX Adapters
└── workers/
    ├── scanner/                 # Opportunity Discovery Daemon
    └── risk-monitor/            # Background Circuit Breaker Watchdog
```

---

## 7. Deployment Topology

### Production Deployment Spec
1. **Container Orchestration**: Kubernetes with isolated namespaces:
   - `sisera-core`: Gateway, OMS, Risk, Ledger, Execution.
   - `sisera-quant`: Scanner, Agents Runtime, Memory Vector DB.
   - `sisera-edge`: Web Terminal, WebSocket ingress.
2. **Database Clustering**:
   - PostgreSQL 16 primary-replica with automated failover for financial transactions.
   - ClickHouse cluster for ticks, L2 order books, and TCA analytics.
   - Redis Sentinel / Cluster for session caching and atomic locks.
3. **High Availability**:
   - Zero-downtime rolling deployments with readiness and liveness probes.
   - Circuit breakers automatically trip to read-only mode during database degradation.
