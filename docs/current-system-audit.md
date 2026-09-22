# Sisera — Current System Audit

> Phase 0 deliverable. This audit was produced against commit `e77bfcd` ("feat: initialize
> Sisera algorithmic trading and intelligence platform"), the single commit that currently
> constitutes the entire Git history of the repository. It is the pre-migration baseline
> for the Sisera V2 transformation and must be read before any refactor begins.

---

## 1. What the repository actually is

Sisera is a **derivatives-native crypto trading bot** implemented as a single Python
package (`sisera/`, ~13,900 LOC of `.py` across 23 modules) plus a static web dashboard,
a Telegram alert/interactive bot, and a 55-file test suite.

- **Language / stack:** Python 3.12, `pydantic` v2, `pandas` + `numpy`, `requests`,
  `ccxt` (for the Bybit execution adapter), `fastapi`/`uvicorn` (web API), `telethon`
  (Telegram news ingestion), `tenacity` (retries), `feedparser` (RSS). Package manager is
  `uv` (`pyproject.toml` + `uv.lock`).
- **Storage:** two SQLite files — `sisera_cache.db` (ephemeral caches) and
  `sisera_ledger.db` (the Decision Ledger). No PostgreSQL, no ClickHouse, no Redis, no
  message bus.
- **Venue:** Bybit USDT linear perpetuals only. Universe = top-200 market-cap coins that
  have a Bybit perpetual listed.
- **Execution:** two adapters behind a common `ExecutionAdapter` protocol —
  `PaperExecutionAdapter` (simulated fills) and `BybitExecutionAdapter` (CCXT, testnet or
  live). **Live trading is not gated by an explicit safety flag** — it activates the moment
  `SISERA_BYBIT_API_KEY`/`SISERA_BYBIT_API_SECRET` are populated and
  `SISERA_USE_TESTNET=false`.
- **Test suite:** 344 tests, all passing (`python -m pytest -q` → 344 passed in ~10s).
  Coverage is broad: data clients, indicators, scoring/calibration, ranking, opportunity +
  decision policy, risk, stress testing, backtest + attribution, drift + differential
  intelligence, ledger, orchestrator, web API, Telegram bot, E2E pipeline.

The design intent is documented exceptionally well in `SCOPE.md` (470 lines): it defines
the `Observe → Understand → Predict → Decide → Optimize → Execute → Reassess → Learn`
pipeline, module contracts, an expected-utility Decision Policy, calibrated confidence,
Champion/Challenger, drift detection, a decision ledger, and explicit "no LLM in the live
trading critical path" rule. **The code largely realizes this intent.** This is a mature
prototype, not a toy — and not a greenfield to be discarded.

---

## 2. What is worth preserving (the strongest components)

These are genuinely good and map almost 1:1 onto Sisera V2's intelligence fabric. Preserve
and migrate, do not rewrite from scratch.

| Existing module | Why it is strong | V2 destination (§56) |
|---|---|---|
| `sisera/indicators/*` | Five indicator families (technical, derivatives microstructure, options, fundamental/onchain, composite), each normalized to a common `-1..1`/`0..1` output with reliability weights. The derivatives-microstructure family (funding, OI, long/short ratio, basis, liquidation cascade, mark-index divergence, order-book imbalance, cross-venue divergence) is the genuine edge. | `quant/indicators/` |
| `sisera/scoring/*` | Confidence/risk/EV as three independent axes; per-timeframe strategy profiles; calibration (isotonic), explicit epistemic uncertainty, Champion/Challenger, indicator relevance/pruning, event attribution, LLM track record. | `quant/scoring/` |
| `sisera/opportunity/*` | `Opportunity` as a rich structured trade thesis (invalidation conditions, EV-R, uncertainty, crowding, execution quality, catalysts, `why_now` triggers, provenance). `DecisionPolicy` is a real expected-utility evaluator, not a threshold hack. | `quant/opportunity/` |
| `sisera/risk/*` | Kelly-inspired sizing, isolated-margin leverage with a cascade-wick + maintenance-margin stress derivation, ATR trailing stops with DVOL widening, correlation-cluster + BTC-beta limits, circuit breakers, pre-trade portfolio stress test, profit-lock ladder. | `services/risk/` + shared domain |
| `sisera/position/*` | Position Intelligence: thesis re-evaluation (HOLD/ADD/REDUCE/EXIT/TIGHTEN_STOP/WIDEN_STOP) on open positions. | `quant/intelligence/` or `services/portfolio/` |
| `sisera/ledger/*` | Decision Ledger: immutable decision-provenance store with `model_version`/`strategy_profile_version`/`risk_policy_version`/`execution_policy_version`, reason codes, and counterfactual settlement. The *concept* is exactly V2 §18. | `services/ledger/` (decision side) |
| `sisera/backtest/*` | Event-driven full-pipeline replay with realistic fee/slippage/funding, walk-forward, Deflated Sharpe, trade attribution + "why not" attribution. | `quant/backtesting/` |
| `sisera/intelligence/*` | Differential ("What changed?"), drift detection, market intel, position intel. | `quant/intelligence/` |
| `sisera/memory/*` | Market Memory (historical-analog retrieval). | `quant/intelligence/` |
| `sisera/execution/intelligence.py` | Post-only-first/market-fallback with alpha-decay-aware timeout, order slicing against real depth. | `services/execution/` |
| `sisera/data/bybit.py` | Clean Bybit V5 client with real pagination for extended klines/funding/OI/mark/index price history. | `connectors/exchanges/` + `services/market-data/` |

**The `SCOPE.md` document itself is a major asset.** Its module contracts (§2), config
surface (§17), and open questions (§15) are a ready-made requirements specification for
V2. Preserve it as `docs/scope-v1.md` or fold it into the V2 architecture docs.

---

## 3. What should be refactored (weak but salvageable)

1. **Bybit leak-through.** `Opportunity`/`Position`/`Ticker` are mostly canonical, but the
   client layer, the `ccxt` adapter, and the web routes still assume Bybit symbols
   (`BTCUSDT`, `1000PEPEUSDT`) and Bybit-specific concepts (`linear` category,
   `positionIdx: 0`). Needs the canonical Instrument Master + venue adapter (V2 §8, §10).
2. **No Order Management System.** Orders are fire-and-forget adapter calls. There is no
   order state machine, no `clientOrderId`, no idempotency, no parent/child, no lifecycle
   persistence. This is the single largest gap relative to V2 §12.
3. **No financial ledger.** "Ledger" in this repo means *decision* ledger only. There is
   no double-entry accounting ledger; fills, fees, funding are tracked ad-hoc on
   `Position`/`PortfolioState` floats. V2 §17 is greenfield on top of the decision ledger.
4. **Float accounting everywhere.** Monetary balances, prices, quantities, and fees are
   all `float`. No `Decimal`/fixed-point. V2 §6 mandates exact types.
5. **`DecisionLedger` schema is not the V2 decision ledger.** It has provenance versioning
   and counterfactuals (good) but is missing market snapshot id, portfolio snapshot id,
   features, signal components, confidence, expected value as structured fields, and the
   full fill/attribution linkage (V2 §18).
6. **`Opportunity` carries hardcoded defaults.** Fields like `pre_trade_book_ev_r=1.42`,
   `post_trade_book_ev_r=1.83`, `expected_return_pct=2.50`, `thesis_quality=0.85` are
   baked defaults that get serialized as real values when a caller forgets to populate
   them. These are exactly the "hidden fallback numbers" V2 §9/§30 prohibits.
7. **Web routes re-derive and fabricate.** `/api/candidates`, `/api/market-intelligence`,
   `/api/what-changed`, `/api/portfolio` contain inline fallback constants
   (`btc_price = 62961.0`, `breadth_pct = 68.0`, `funding = 0.000065`, dvol fallback `52.4`)
   and heuristically reconstruct fields the ledger/Opportunity should already carry.
8. **Synchronous I/O on server paths.** Every FastAPI endpoint is `def` (threadpool) and
   performs blocking `requests` calls inline; the WebSocket fan-out polls at 2s in a
   `while True` loop. Fine for a local dashboard, not for V2's concurrency targets.
9. **Paper adapter is low-fidelity.** It fills instantly at the passed price, ignores
   order-book depth, slippage, latency, partial fills, and order type (V2 §52). The
   original SCOPE.md intended Bybit testnet for paper fidelity; the current `PaperExecutionAdapter`
   is a mock, not testnet.
10. **Config is a global frozen dataclass singleton** (`sisera/config.py`, `config = Config()`
    at import) reading env at import time. No per-environment validation, no structured
    secrets, no hot reload. V2 §35/§55 needs a proper config layer.

---

## 4. What should be removed (prototype anti-patterns, V2 §57)

1. **Global singleton orchestration.** `sisera/interfaces/web/routes.py` holds module-level
   engine singletons (`_market_intel_engine`, `_stress_engine`, …) and a lazily-constructed
   global `Orchestrator` (`get_orchestrator()`), mutated via `set_api_context()`.
2. **Background workers tied to API lifespan.** `sisera/interfaces/web/app.py` `lifespan`
   spawns `_live_stream_worker` / `_periodic_scan_worker` / `_news_monitor_worker` as
   in-process asyncio loops. V2 §57 explicitly prohibits these.
3. **Wildcard CORS.** `allow_origins=["*"]` with `allow_credentials=True` in `app.py`.
4. **Hidden fallback numbers.** `_BASE_PRICES` / `_FALLBACK_INSTRUMENTS` and the synthetic
   OHLCV/orderbook/ticker generators in `bybit.py` silently replace unavailable live data
   with plausible fake data. This is precisely what V2 §9 ("NEVER replace unavailable live
   financial data with plausible-looking hardcoded numbers") forbids in production paths.
5. **SQLite as production state.** Both `sisera_cache.db` and `sisera_ledger.db` are file
   SQLite with no migration tooling (ledger schema is patched via `ALTER TABLE … ADD
   COLUMN` inside `_init_db`).
6. **No authentication on the web API.** Every endpoint (including `POST /api/scan`,
   `POST /api/positions/{symbol}/close`, `POST /api/emergency_stop`) is unauthenticated.
   There is no user/organization/role model at all. V2 §33–§35 is entirely greenfield.
7. **No live-trading kill switch.** `BybitExecutionAdapter` will submit live orders if
   keys are present; there is no `SISERA_LIVE_TRADING_ENABLED` gate, no environment
   guard, no reduce-only emergency mode (V2 §53, §37).
8. **Direct frontend assumptions about Bybit** in `static/app.js` (symbol formatting,
   venue-specific labels).
9. **`.DS_Store` files committed** to the tree.

---

## 5. Security problems (V2 §2, §35)

1. **CRITICAL — a live Telegram MTProto session is committed.**
   `sisera_telegram_news.session` is tracked in Git (it is a SQLite database holding the
   Telegram user-account authentication for the news monitor). Anyone with repo access can
   impersonate that Telegram account. This must be revoked and the file untracked
   immediately. See `docs/security/credential-remediation.md`.
2. **`.env` is correctly gitignored**, but a populated `.env` exists in the working tree
   containing real secrets: `SISERA_OPENROUTER_API_KEY`, `SISERA_TELEGRAM_NEWS_API_ID/HASH`,
   `SISERA_FRED_API_KEY`, `SISERA_X_BEARER_TOKEN`, `SISERA_BYBIT_API_KEY/SECRET` (currently
   empty). The repo history (single commit) does **not** contain `.env`, which is good —
   but the Telegram session commit means the associated API id/hash pair should also be
   treated as compromised.
3. **No secret scanning in CI.** There is no GitHub Actions workflow at all (no lint,
   no test, no secret scan, no dependency scan).
4. **Secrets stored in plaintext env**, no KMS/Vault abstraction, no encrypted
   provider-credential storage (V2 §35).
5. **No authN/authZ** (above), so any deployment is trivially operable by anyone who can
   reach the port.
6. **No rate limiting** on API endpoints; the dashboard polling loop re-fetches Bybit
   tickers for every position every 2 seconds.
7. **No audit logging of control actions** (`emergency_stop`, `close_position`) beyond
   in-process logs.
8. **`allow_credentials=True` + wildcard origin** (above).

---

## 6. Scalability & architectural bottlenecks

1. **Single-process monolith.** Orchestrator, web server, background workers, and data
   clients all share one process and one SQLite file set. No horizontal scaling story.
2. **SQLite write contention** under concurrent workers (the codebase has already
   discovered and fixed one connection-leak/lock bug in `DecisionLedger`; SQLite remains a
   ceiling).
3. **Full-universe scan is O(universe × timeframes × API calls)** with synchronous HTTP;
   the 200-coin universe is currently bounded by rate limits, not compute, but any
   multi-venue or multi-asset expansion will not fit this shape.
4. **WebSocket fan-out is a single in-process broadcast loop** with no sequence numbers,
   snapshot/delta recovery, or reconnect semantics (V2 §46).
5. **No event bus.** Cross-cutting concerns (settlement, reconciliation, attribution,
   notifications) are inline method calls in `Orchestrator`, which is now 1,034 lines and
   growing.

---

## 7. Correctness risks

1. **Float accounting** — P&L, margin, liquidation-price math is all `float`; rounding and
   precision errors are unquantified (V2 §6, §17).
2. **Hardcoded `Opportunity` defaults leaking as real values** (see §3.6).
3. **No idempotency** on order placement — a retried submit can double-fill (V2 §12).
4. **`qty = notional / price` is naive** — no lot-size/tick-size/precision clamping
   against the venue's instrument metadata (V2 §8).
5. **Liquidation/leverage model is a per-cluster approximation** (`_CLUSTER_CASCADE_SIZES`,
   `_MAINTENANCE_MARGIN_RATES` hardcoded) rather than venue-reported values.
6. **Synthetic data path is indistinguishable from real data** to callers except by the
   `_offline_mode` flag on the client — the web layer does not reliably surface
   "stale/fake" state (V2 §9).

---

## 8. Data-quality problems

1. **Synthetic fallback everywhere in `bybit.py`** (klines, orderbook, ticker, OI,
   long/short ratio) — see §4.4.
2. **No market-data quality states** (`LIVE/DELAYED/STALE/DEGRADED/UNAVAILABLE`) — V2 §9.
3. **No canonical market-data event model** — raw REST payloads are consumed directly
   (`TradeTick`, `Candle`, `OrderBookSnapshot`, etc. do not exist).
4. **Reconciliation exists** (`sisera/data/reconciliation.py`) but is scoped to data-source
   divergence, not venue accounting reconciliation (V2 §50 is greenfield).

---

## 9. Production-readiness gaps (summary)

No auth; no OMS; no financial ledger; no live-trading safety gate; no secret scanning;
no CI; no container/helm/terraform; no observability (OpenTelemetry/metrics/structured
JSON logs); no migrations (Alembic); no idempotency; no paper-trading fidelity; no
organizations/RBAC/approvals; no kill switches; no API versioning (`/api/...` not
`/api/v1/...`); no OpenAPI-generated TS client; no mobile app; no prediction-market
domain.

---

## 10. Migration decision

**Migrate, do not rewrite.** The intelligence pipeline, scoring/calibration, opportunity +
decision policy, risk, position intelligence, backtest/attribution, and the decision-ledger
concept are strong and map directly onto Sisera V2's `quant/` and `services/` layout. The
transformation is: (a) fix security, (b) extract canonical domain models and financial
types, (c) replace the singleton monolith with service boundaries + event bus, (d) add the
missing institutional layers (auth, OMS, financial ledger, kill switches, instrument
master, market-data platform), and (e) rebuild the web UI as a real terminal.

The remainder of this repository's migration is specified in `docs/architecture.md` (to be
written in Phase 0/1) and the ADRs under `docs/adr/`.
