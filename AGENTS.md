# SISERA V2 — AUTONOMOUS AGENTS FRAMEWORK

> **Declarative Agent Manifests, Autonomy Levels, Governance Guardrails, and Promotion Pipeline**

---

## 1. Governance Principles & Invariants

Autonomous agents in Sisera are subject to strict institutional guardrails (spec §52, ADR-008 & ADR-009):
1. **No Direct Execution**: Agents never execute orders directly against venues. They submit structured proposals to the policy engine and pre-trade risk engine.
2. **Deterministic Sandboxing**: Strategies run in isolated execution contexts with hard caps on memory, CPU, and maximum allocated capital.
3. **Formal Promotion Pipeline**: No agent can trade live capital without progressing through rigorous evaluation stages.

---

## 2. Autonomy Levels

| Level | Identifier | Execution Authority | Human Intervention |
|---|---|---|---|
| **0** | `RESEARCH` | Read-only market data and quantitative analysis. Cannot propose trades. | None |
| **1** | `SUGGEST` | Generates trade recommendations and signals with full rationale. | Operator must create and submit the order. |
| **2** | `CONFIRM` | Compiles structured trade orders; requires one-tap operator confirmation. | Mandatory operator confirmation per trade. |
| **3** | `POLICY_AUTO` | Automatically executes orders that strictly satisfy a declarative policy. | Real-time monitoring; manual pause/kill override. |
| **4** | `AUTONOMOUS` | High-frequency or complex multi-leg execution within risk boundaries. | Daily supervision; automated circuit breakers. |
| **5** | `EMERGENCY_RISK_ONLY` | Dedicated watchdog agent authorized only to reduce exposure or liquidate. | Post-incident audit review. |

---

## 3. Declarative Manifest Specification

Agents are specified declaratively via YAML manifests:

```yaml
version: "2.0"
agent:
  id: "btc_momentum_alpha_v2"
  name: "BTC Trend Follower v2"
  description: "Multi-timeframe trend following with dynamic funding rate filter"
  autonomy_level: "POLICY_AUTO"
  lifecycle_stage: "PAPER"

capital_allocation:
  max_capital_usd: "100000.00"
  max_trade_notional_usd: "25000.00"
  max_leverage: "3.0"

strategy:
  universe:
    - "binance:BTC/USDT:perpetual"
    - "hyperliquid:BTC-USD:perpetual"
  timeframes: ["5m", "1h", "4h"]
  factors:
    - name: "ema_cross"
      parameters: { fast: 12, slow: 26 }
    - name: "funding_percentile"
      parameters: { window_days: 14, max_percentile: 85 }

risk_guardrails:
  max_daily_drawdown_pct: 3.5
  stop_loss_pct: 1.5
  take_profit_pct: 4.0
  max_open_positions: 2
  kill_switch_action: "CANCEL_ALL_AND_HALT"

execution:
  algorithm: "SOR_MAKER_FIRST"
  max_slippage_bps: 2.5
  urgency: "MEDIUM"
```

---

## 4. Evaluation & Promotion Pipeline

Every autonomous agent follows a mandatory 7-stage promotion lifecycle before handling live institutional capital:

```text
[1. DRAFT] ─── (Code authoring & static validation)
    │
    ▼
[2. BACKTEST] ─── (5+ years tick/candle simulation; Sharpe > 1.8, Max DD < 10%)
    │
    ▼
[3. STRESS_TEST] ─── (Simulated flash crashes, liquidity freezes, de-peg events)
    │
    ▼
[4. PAPER] ─── (Minimum 14 days forward paper execution against live order book)
    │
    ▼
[5. SHADOW] ─── (Parallel evaluation against live production order flow)
    │
    ▼
[6. LIMITED_LIVE] ─── (Live capital restricted to <= 10% maximum allocation)
    │
    ▼
[7. LIVE] ─── (Full production deployment with real-time risk supervision)
```

### Automatic Demotion & Circuit Breakers
An agent is instantly demoted to `PAUSED` or `PAPER` if:
- Realized daily drawdown exceeds the configured limit.
- Implementation shortfall exceeds 3x the backtest expectation.
- Connectivity to order book data degrades for more than 5 seconds.
