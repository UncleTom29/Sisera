# Sisera — Scope & Architecture

AI-powered, modular trading bot. Phase 1 scope: top 200 crypto coins by market cap **that have a Bybit perpetual contract listed**, multi-indicator scanning with per-indicator/per-pair/per-timeframe ranking, confidence + risk scoring, automated execution on top-ranked candidates, trailing-stop risk management. Built on free-tier tools only. Designed so other asset classes (equities, forex) can be added as new modules later without touching the core.

Reference baseline: [Alchemy's AI trading bot guide](https://www.alchemy.com/blog/how-to-build-an-ai-trading-bot) — reality checks worth internalizing before scaling this: only 10–30% of bot users are consistently profitable, 55–60% prediction accuracy is *good*, and live performance typically runs 20–30% worse than backtest. The scanning/ranking system described below is more sophisticated than that guide's single-model approach, which raises overfitting and data-quality risk further — treat every number below as a hypothesis to validate, not a spec to trust blindly.

---

## 1. Design Principles

- **Derivatives-native, not spot-adapted.** This bot trades perpetual futures, full stop — funding rate, open interest, liquidation dynamics, and leverage are first-class inputs from the start, not a leverage dial bolted onto a spot-style momentum bot. Every indicator family, sizing rule, and stop mechanism in this doc is designed assuming derivatives; see §5 for the market-microstructure signals this makes available for free.
- **Sisera's intelligence stack, end to end: Observe → Understand → Predict → Decide → Optimize → Execute → Reassess → Learn.** Observe is the Data Layer (§3); Understand is the Indicator Engine (§5) plus Market Memory (§6); Predict is Scoring & Ranking's calibrated confidence/EV/uncertainty (§7); Decide is the Opportunity Engine & Decision Policy (§8); Optimize is Portfolio Construction (§9); Execute is Execution Intelligence (§11); Reassess is the Position Intelligence Engine (§12); Learn is the Backtesting Engine, drift detection, and Champion/Challenger (§7, §10). Naming the chain once here is a framing note, not a restructuring of the doc — each link already has a home.
- **Modular by asset class.** Everything asset-specific (data source, tradable universe, execution venue) sits behind interfaces. The scanning/ranking/risk/execution core doesn't know it's trading crypto.
- **Free tools only.** Every data source and execution path must have a working free tier. This is the single biggest constraint on the design — it shapes scan cadence, universe size handling, and indicator choice more than anything else.
- **Confidence ≠ conviction to act.** Every signal carries a confidence score AND a risk score. They are not the same axis: high confidence + high risk (e.g. a strong signal on an illiquid micro-cap) should be sized very differently from high confidence + low risk.
- **Expected value and risk-adjusted metrics gate live trading — win rate is diagnostic, not a hard floor.** Each traded timeframe must clear its own minimum thresholds on Expected Value, profit factor, and risk metrics (max drawdown, tail loss, Deflated Sharpe Ratio — §8, §10, §13) independently. Win rate is tracked and reported per timeframe but does not block on its own: a high-EV, asymmetric setup with a middling hit rate is exactly the kind of strategy the trailing-stop "let winners run" design is meant to capture, and a hard win-rate gate would reject it for the wrong reason.
- **Ranking is not a decision.** A top-ranked candidate can still be the wrong trade right now — because execution conditions are poor, model uncertainty is high, or the setup's EV doesn't clear the bar despite a strong rank. §8's Opportunity Engine & Decision Policy is the module that actually decides TRADE / WAIT / NO_TRADE; Scoring & Ranking (§7) feeds it candidates, it doesn't make the call itself.
- **No LLM in the live trading decision critical path.** The GBM/calibration layer (§7) and the Decision Policy (§8) make the trade decision. An LLM may generate the plain-language rationale for a decision already made (below), and may assist offline in research or code — it never chooses a trade. Worth stating explicitly given how tempting an LLM-driven decision layer is for something branded "AI-powered."
- **Paper trade before live, small before large.** Non-negotiable phase gate — see §11.
- **Everything is logged, with decision provenance, not just outcomes.** Every scan, score, rejected candidate, and executed trade is persisted. For a system making leveraged decisions with real capital, go one step further than raw logging: capture a structured snapshot per trade at decision time (which indicators contributed how much, regime classification, liquidation-cascade state, confidence/risk breakdown) rather than reconstructing it later from raw rows, plus a short plain-language rationale generated from that snapshot and stored alongside the trade. This lives downstream of the trade (explaining a decision already made), not in the execution critical path — a real debugging aid, not a live dependency. This snapshot schema should be shared between the Backtesting Engine (§10) and live trading from the start — designed once, not twice — so the research environment can faithfully reproduce why live Sisera made a decision; it's the same structured object §8's Opportunity Engine already produces per candidate, not a separate schema. Without this you cannot debug why the bot did (or didn't) do something three weeks ago, and you cannot backtest your *actual* scoring logic vs. a reconstruction of it. Treat it as a **decision ledger, not just a log**: every entry is immutable once written and carries `model_version`, `strategy_profile_version`, `risk_policy_version`, `execution_policy_version`, and `reason_codes` alongside the snapshot — so a bad decision six months from now can be traced to exactly which version of every subsystem made it, the same way source control traces a bug to a commit.

---

## 2. Module Boundaries

The Orchestrator/Scheduler triggers each scan cycle; the Universe Manager (§4) tells the Data Layer what's in scope to scan; Logging/Monitoring/Alerts observes every stage. The main pipeline, in order:

```
Data Layer ──► Data Aggregation & Reconciliation (§3)
    │
    ▼
Indicator Engine (§5 — technical, derivatives microstructure, options, on-chain)
    │
    ▼
Market Memory (§6 — historical-analog retrieval)
    │
    ▼
Scoring & Ranking (§7 — confidence + risk + expected value + uncertainty)
    │
    ▼
Opportunity Engine & Decision Policy (§8 — TRADE / WAIT / NO_TRADE)
    │
    ▼
Portfolio Construction & Risk Manager (§9 — incremental EV, factor exposure, stress test)
    │
    ▼
Execution Adapter + Execution Intelligence (§11)
    │
    ▼
  [ position open ]
    │
    ▼
Position Intelligence Engine (§12 — HOLD / ADD / REDUCE / EXIT / TIGHTEN_STOP / WIDEN_STOP)
    │
    ├──► loops back to Risk Manager (§9) / Execution (§11) whenever it calls for action
    ▼
Trade Attribution + "why not" attribution (§10)

Continuous side rail (runs alongside the pipeline above, not a one-shot stage):
  Champion/Challenger · drift detection · Indicator Relevance & Pruning · Backtesting Engine (§7, §10)
```

This is a pipeline diagram, not a strict box-per-module render — box-drawing alignment gets fragile past a handful of boxes, so a labeled flow is more legible and more maintainable as the module count grows. The asset-class-specific pieces are **Data Layer**, **Universe Manager**, and **Execution Adapter** — those get reimplemented per asset class. Everything else (**Indicator Engine, Market Memory, Scoring, Opportunity Engine, Portfolio Construction, Risk Manager, Position Intelligence Engine, Orchestrator**) is asset-agnostic and shared.

### Module contracts (interfaces to define early)

| Module | Interface responsibility |
|---|---|
| `DataProvider` | `get_ohlcv(pair, timeframe, lookback)`, `get_fundamentals(pair)`, `get_universe()` |
| `Indicator` | `compute(ohlcv_df) -> score (0-1 or -1..1)` — every indicator, technical or fundamental, normalizes to a common output shape |
| `Scorer` | `score(pair, timeframe, indicator_results) -> {confidence, risk, expected_value, uncertainty}` |
| `RankingEngine` | `rank(all_pair_scores) -> ordered candidate list` |
| `MarketMemory` | `query_analogs(state) -> [historical outcomes]` — see §6; optional input to the Opportunity Engine once enough history exists |
| `OpportunityEngine` | `package(candidate) -> Opportunity` — see §8; the structured trade-thesis object, also the decision-provenance payload from §1 |
| `DecisionPolicy` | `decide(opportunity, portfolio_state) -> TRADE \| WAIT \| NO_TRADE` — see §8; a ranked candidate does not trade itself, this is what does |
| `RiskManager` | `size_position(candidate, portfolio_state) -> qty`, `check_stops()`, `check_circuit_breakers()`, `stress_test_portfolio(candidate, portfolio_state) -> pass/reject` — see §9 |
| `ExecutionAdapter` | `place_order()`, `place_trailing_stop()`, `get_positions()`, `get_balance()` — implemented once for paper mode, once per live venue |
| `PositionIntelligence` | `reevaluate(position, opportunity) -> HOLD \| ADD \| REDUCE \| EXIT \| TIGHTEN_STOP \| WIDEN_STOP` — see §12; acts on an already-open position, doesn't bypass RiskManager/ExecutionAdapter |

Getting these interfaces right *before* writing indicator logic is the highest-leverage engineering decision in this project — it's what makes "add forex later" actually cheap instead of a rewrite. Note: what the pasted architectural review calls a "Strategy Ensemble" is not a new module here — it maps onto the existing Timeframe Strategy Profiles (§7), i.e. the collection of per-timeframe/per-cluster indicator sets and weights already feeding the Scoring & Ranking output. Naming it once, consistently, avoids the doc implying two different things.

---

## 3. Data Layer (Free-Tier Stack)

Scanning 200 coins × multiple timeframes × multiple indicators on free tiers is the real bottleneck, though dropping from 500→200 (see §4) meaningfully eases it. Rate limits, not compute, will dictate your scan cadence. Every data need below is sourced from a **primary provider with one or more free fallbacks**, not a single point of failure — the fallback only gets queried on throttle/outage/divergence, not redundantly every cycle (that would burn the free-tier budget for nothing).

| Need | Primary | Fallback(s) | Constraint / notes |
|---|---|---|---|
| Perpetual contract list (defines the universe) | **Bybit V5 `/v5/market/instruments-info`** (free, no key) | — | Source of truth for "is this coin even tradable here" — the Universe Manager filters everything else against this list first, see §4 |
| Market cap ranking (to pick top 200 of Bybit's listed contracts) | CoinGecko free API | CoinPaprika (20k calls/mo free, personal use), CoinCap | ~10-30 calls/min depending on tier; batch `/coins/markets` (up to 250/page) rather than per-coin calls |
| OHLCV price/volume, multi-timeframe | **Bybit's own API** (same venue as execution — see §11) | CCXT against Binance/Kraken | Using the execution venue's own feed as the primary source (not just a fallback) keeps the signal you scored consistent with the price you'll actually fill at |
| Derivatives positioning (funding rate, open interest, long/short ratio) | **Bybit V5**: `/v5/market/history-fund-rate`, `/v5/market/open-interest`, `/v5/market/account-ratio` — all free, public, no auth | — | See §5. Funding settles 3x/day on Bybit (00:00/08:00/16:00 UTC) — this 8h periodicity is a real structural signal, not just a data point, see §4 |
| Real-time liquidations (cascade detection) | **Bybit V5 WebSocket `allLiquidation.{symbol}`** — free, public, pushes every liquidation event (not the old 1-msg/sec sampled feed) | — | New-ish (2025) full feed — makes cascade detection actually viable rather than a sampled approximation. See §5 |
| Mark price / index price divergence | Bybit V5 `/v5/market/tickers` (`markPrice`, `indexPrice` fields) — free, public | — | Same call already fetching ticker/OHLCV data — no extra rate-limit cost. See §5 |
| Options-implied volatility & skew (BTC/ETH only) | **Deribit public API** (no auth for market data — native DVOL implied-vol index + options chain) | — | Scoped to BTC/ETH only, per decision — a second exchange integration, but free/public market data with no rate-limit friction reported. See §5 |
| Order book depth | **Bybit V5 `/v5/market/orderbook`** (REST, up to 500 levels, default 25) or WebSocket `orderbook.{depth}.{symbol}` (public, depth tiers 1/50/200/1000) | — | Free, same venue, barely any extra rate-limit cost on top of ticker/OHLCV calls already being made. Replaces mcap/volume-ratio as an actual liquidity read instead of a proxy for one — see §5, §7, §10 |
| Cross-venue funding rate & basis (for divergence signal) | CCXT `fetchFundingRate` against Binance | OKX, Gate.io (also CCXT-supported) | Kraken doesn't run comparable perpetual funding, so it's not a fit here despite being an existing OHLCV fallback (§3 above) — Binance/OKX/Gate.io are the CCXT-supported venues for this. See §5 |
| DEX liquidity / volume / TVL | DexScreener (free, no API key) | DeFiLlama (free, no key, effectively no rate limit on normal traffic) | Both are open APIs — no scraping needed here. Strengthens the liquidity/risk-score inputs directly (see §5, §7) |
| On-chain metrics (gas, whale transfers, active addresses) | Alchemy free tier (per the reference guide) | Etherscan API, Covalent free tier | Meaningful mainly for on-chain-native assets (ETH, ERC-20s) — most of the 200 won't have deep on-chain signal available for free, decide upfront how you degrade gracefully for those |
| Fundamental/tokenomics (circulating supply, FDV, mcap/volume ratio) | CoinGecko `/coins/{id}` | CoinPaprika | Same rate-limit budget as above — fetch once per universe refresh (daily), not per scan cycle |
| Sentiment — market-wide baseline (minor input, not primary) | Fear & Greed Index (alternative.me, free, no key) | feargreedchart.com (free, no key) | Cheap and reliable, but market-wide, not per-coin, and blunt on its own — kept as one low-weight input into the composite indicators in §5, not the sentiment signal it once was in this doc |
| Sentiment — per-coin/social, richer | *(no reliable free API exists as of 2026)* | **Scraping** (news headlines, Reddit, X mentions) as best-effort only, deprioritized for v1 | Explicitly non-core: brittle (breaks on site layout changes), possible ToS friction depending on target — must degrade gracefully to "no data" for a pair rather than blocking the scan loop. Given the derivatives-positioning data above is free, richer, and has no ToS risk, recommend treating this as a "later, if backtesting shows a gap" item rather than a v1 build target |

### Data Aggregation & Reconciliation

A small module sits between the Data Layer and the Indicator Engine, responsible for cross-checking sources rather than trusting any single one blindly — this is the actual failure mode worth guarding against (an API silently returning stale or wrong data), not something an LLM second-opinion would catch any better:

- For facts obtainable from 2+ sources (price, market cap, volume): compare primary vs. fallback. Within tolerance (e.g. <1% divergence) → use the primary value, proceed normally.
- Beyond tolerance → flag the pair for that cycle. Either lower its data-completeness component of the risk score (per the fallback-tier logic below) or skip scoring it entirely that cycle if the divergence is extreme — see open question in §15 on which default to pick.
- On primary-source failure or throttle → fail over automatically, and log the failover event (needed later for the Backtesting Engine in §10 to reconstruct realistic data-availability gaps, not assume clean data was always there).

**Design decision to make early:** not all 200 coins will have equal data depth (on-chain data, especially, thins out fast past the top ~50-100 by mcap). Decide the *fallback tier* — e.g., coins without on-chain data still get scored on technical + basic fundamental indicators, just with on-chain indicators zero-weighted for that pair, and the risk score should reflect that thinner signal (lower confidence ceiling for data-sparse assets). This is the same mechanism the reconciliation step above feeds into for divergent-data pairs — one fallback-tier concept, not two competing ones.

**Formalize this into a data confidence score**, rather than leaving "data completeness" as an implicit idea referenced loosely elsewhere in this doc: combine freshness (how stale is the last update), cross-source agreement (from the reconciliation step above), and coverage (how many of the expected indicators actually had usable data) into one explicit per-pair number. §7's risk score and §8's Opportunity object both reference this one concrete score rather than each reinventing their own notion of "how much do we trust this data."

**Caching is mandatory, not optional.** Even at 200 coins, a naive "fetch everything every cycle" approach will blow through free-tier rate limits fast. Plan a local cache (SQLite/Postgres, both free) with TTLs per data type: fundamentals refresh daily, OHLCV refreshes per-timeframe (a 1h candle doesn't need refetching more than hourly), on-chain/whale data can stream via WebSocket and update incrementally rather than polling.

**Universe size (200) is a config value, not a constant** — see §17. Shrinking it further (e.g. to your highest-conviction 50-100) is a one-line config change if scan cadence or free-tier budget ever gets tight, no code change required.

---

## 4. Universe & Scan Cadence

- **Universe Manager construction order matters**: pull Bybit's listed perpetual contracts first (`/v5/market/instruments-info`), then rank *that* list by market cap (via CoinGecko) and take the top 200. This is the opposite order from a generic "top 500 globally, then intersect with the exchange" approach — by construction, every coin in the universe is tradable on Bybit, so there's no scan-but-can't-execute mismatch to reconcile later (see §11).
- Refreshed on a slow cadence (daily is plenty — the top 200 doesn't reshuffle hour to hour). This list feeds everything downstream.
- **Scan cycle** frequency is bounded by rate limits, not ambition. Dropping the universe from 500→200 cuts the per-cycle API call volume by more than half, which either buys headroom for richer per-pair indicators or allows a tighter scan cadence — worth deciding which to spend it on once real rate-limit usage is measured. Realistic v1 target: full-universe scan every 15–60 minutes for higher timeframes (4h/1d indicators don't need faster), with a faster sub-loop (5 min) for open-position monitoring (trailing stops, funding rate, margin ratio, liquidation price) restricted to the coins you actually hold — a much smaller, cheaper set of API calls than scanning all 200.
- **Timeframe matrix**: decide which timeframes matter for which indicator category up front — see §5's per-timeframe applicability breakdown, since this is no longer "compute everything everywhere," it's a genuinely different indicator mix per timeframe. Don't compute every indicator on every timeframe by default — that's where free-tier budgets die, and see §7 for pruning indicators that turn out not to matter for a given pair/timeframe at all.
- **Funding-cycle awareness**: Bybit settles funding 3x/day (00:00, 08:00, 16:00 UTC) for most USDT perpetuals. Positioning indicators (funding rate, OI — §5) have this 8h periodicity structurally baked in, and funding accrual only actually costs money to positions held *through* a settlement. Worth treating proximity to the next funding settlement as an explicit scan-timing input (e.g. a fast check just before settlement) alongside the calendar-based timeframe matrix, not just another number read on a fixed hourly clock.

---

## 5. Indicator Engine

Five families now, each indicator normalized to a common score range so the Scoring Engine can combine them without special-casing. This is the section that most directly answers "derivatives-native, not spot-adapted": the **derivatives market microstructure** family below is the actual edge this bot has that a spot-only or generic-TA bot doesn't, not the technical indicators (those are table stakes everyone has). The basic Fear & Greed–style approach flagged in earlier drafts was too blunt on its own — it's kept only as one low-weight input, not a primary signal.

**Technical (per timeframe) — baseline, not the differentiator:**
- Trend: EMA/SMA crossovers, ADX
- Momentum: RSI, MACD, Stochastic
- Volatility: ATR, Bollinger Band width (also feeds position sizing and stop distance — see §9)
- Volume: OBV, volume trend relative to its own moving average, relative volume vs. universe median
- Structure: recent support/resistance proximity, breakout detection

**Fundamental / on-chain:**
- Market-cap tier and mcap/volume ratio (liquidity proxy)
- Circulating vs. total/max supply (dilution risk)
- On-chain activity trend (active addresses, tx count) — where available
- Whale flow sentiment (exchange inflow/outflow), per the reference guide's approach — where available
- Optional later: dev activity

**Derivatives market microstructure (the core edge — free, per-pair, sourced straight from Bybit itself, no scraping, no extra rate-limit budget beyond what's already being fetched):**
- **Funding rate, level and trend** — persistently high positive funding means longs are paying shorts to stay in, i.e. the crowd is leaning long; historically a contrarian signal at extremes rather than a trend-following one.
- **Open interest change, joined with price direction** — rising OI + rising price = new money confirming the trend (healthy); rising OI + falling price = building short pressure or forced long liquidation risk; falling OI + rising price = short covering, a weaker/less durable move.
- **Long/short account ratio** (`/v5/market/account-ratio`) — a direct crowd-positioning read, complementary to funding rate.
- **Basis** (perp price vs. spot/index premium) — a cheap proxy for how much speculative leverage is currently priced into a pair.
- **Liquidation cascade detection (new)**: the `allLiquidation` feed (§3) pushes every forced liquidation in real time. A cluster of liquidations in a short window (e.g. notional value above a config threshold within N seconds — see §17) is a genuinely rare, genuinely predictive signal most retail bots don't have access to at all: it marks either a capitulation bottom (cascade of longs getting force-sold) or a blow-off top (cascade of shorts getting squeezed), and the regime detector below is what disambiguates which.
- **Mark-index divergence (new)**: persistent premium or discount of mark price vs. index price signals extreme funding pressure or thin order-book depth — a risk flag on its own, and occasionally a mean-reversion trigger when the divergence snaps back.
- **Order-book imbalance (new)**: bid/ask volume imbalance near mid-price, computed from the order book depth data in §3. A genuine short-horizon microstructure signal (not a proxy like mcap/volume ratio), and it also feeds directly into §11's execution-intelligence layer for sizing individual order clips against real depth.
- **Cross-venue funding/basis divergence (new)**: "funding is high and positive" only tells you the crowd is leaning long *on Bybit*. Comparing Bybit's funding rate and basis against the cross-venue average (Binance/OKX/Gate.io via CCXT — see §3) distinguishes a Bybit-specific squeeze setup from genuinely market-wide positioning, which deserve different confidence weights even though the raw Bybit reading looks identical in both cases.

**Options-derived (BTC/ETH only, new):**
- **Implied volatility (Deribit DVOL)** — forward-looking, unlike ATR which is backward-looking (realized). Elevated IV ahead of realized volatility catching up is itself information, and directly informs §9's stop-distance sizing: widen ATR-based stops on BTC/ETH when forward IV is elevated, before realized volatility (and therefore ATR) has caught up.
- **Put-call skew** — rising skew toward puts signals hedging/fear building even while price holds up; rising skew toward calls signals speculative positioning building. A genuinely forward-looking sentiment read, as opposed to funding rate and OI which are more coincident/lagging.
- Scoped to BTC/ETH only (2 of 200 pairs) since that's where liquid options markets exist — everything else in this family is zero-weighted for the other 198 pairs, same fallback-tier mechanism as thin on-chain data (§3).

**Custom / composite indicators (built in-house, combine raw signals into higher-order signals):**
- **Smart-money divergence**: price rising while funding stays flat/negative and OI rises steadily reads as accumulation without crowding (lower reversal risk); price rising while funding spikes, OI spikes, and liquidation cascades start clustering on the short side reads as a crowded, late move (higher reversal risk). Now informed by the liquidation feed as well as funding/OI — a strictly richer read than the funding/OI-only version of this indicator in earlier drafts.
- **Liquidity-adjusted momentum**: scales a raw momentum reading down for pairs with thin DexScreener liquidity or a weak mcap/volume ratio, so a "strong" momentum print on an illiquid coin doesn't carry the same weight as the same print on a liquid one. Formalizes what §7's risk score already does informally, but as an indicator in its own right.
- **Regime detector**: classifies each pair, per timeframe, as trending vs. mean-reverting (e.g. via ADX level or a Hurst-exponent estimate) — and, when a liquidation cascade is detected, whether the cascade looks like capitulation (fade it) or a squeeze accelerating an existing trend (ride it). This is the mechanism that directly answers "don't waste effort on indicators that aren't relevant for a pair right now" — see §7's Indicator Relevance & Pruning, which uses the regime detector's output (and backtested relevance profiles) to decide which indicator families get trusted for a given pair/timeframe, rather than running every indicator everywhere unconditionally.
- **Regime-transition awareness, on top of the trending/mean-reverting classification above**: tag each pair/timeframe as STABLE (current regime is behaving consistently), TRANSITIONING (the prior regime may be breaking down), or UNKNOWN (not enough signal to classify), with a regime-stability score alongside it. A large share of trading-system damage happens when a strategy keeps acting on an assumption that the regime is unchanged after it's actually shifted — confidence (§7) should decay automatically when a pair is TRANSITIONING or UNKNOWN, not just when the regime is classified as directionally unfavorable.

### Per-timeframe applicability

Indicator relevance genuinely differs by timeframe, not just by pair — and Bybit's 8h funding cycle (§4) gives a structural reason why, not just a vibe:

| Horizon | Dominant families | Why |
|---|---|---|
| Short (15m–1h) | Liquidation cascades, mark-index divergence, volume/structure | Inherently short-lived, fast-decaying signals — a cascade detected an hour ago is stale |
| Medium (4h–1d) | Funding rate trend, OI trend, long/short ratio, technical trend/momentum | Aligns naturally with the 8h funding settlement cadence |
| Longer holds (1d+) | Options IV/skew (BTC/ETH), fundamental/on-chain, technical trend | Funding accrual becomes a material cost at this horizon (§9) — options IV's 30-day-forward view is more relevant than a 1h cascade signal at this timescale |

This table is a starting hypothesis, not a conclusion — §7's Timeframe Strategy Profiles is where it actually gets validated (or overturned) per timeframe via backtesting, and §17 makes the applicability mapping itself config, not code.

Each indicator returns a normalized score (e.g. -1 to +1, or 0-1 confidence-of-bullishness) plus its own reliability weight so thinly-computed indicators (e.g. on-chain data on a low-cap coin with sparse history) don't get the same say as well-supported ones. Which indicators run at all for a given pair/timeframe is decided by §7, not hardcoded here.

---

## 6. Market Memory

Structured historical-analog retrieval — "have we seen this market state before, and what happened next" — sitting between the Indicator Engine and Scoring & Ranking:

- Each scan cycle, encode the current market-state feature vector for a pair (regime, positioning, microstructure state — the same aggregated state categories §7's ML layer trains on) and query logged historical states for similar past occurrences.
- Surface, for the matched analogs: continuation rate, median forward return, median MAE, and which Timeframe Strategy Profile (§7) performed best historically in that analog state.
- **Explicitly a v3+ capability, not a day-one build item** (see §16): it needs substantial logged history to be useful at all, which only exists once the Backtesting Engine (§10) and live decision provenance (§1) have been running and accumulating structured snapshots for a while. A day-one Market Memory has nothing to query yet.
- Feeds into §8's Opportunity object as an optional additional input once populated — the core loop must not depend on it, since it starts empty and only becomes useful gradually.
- Similarity metric (nearest-neighbor on raw feature distance, a learned embedding, something else) is genuinely undecided — see §15.

---

## 7. Scoring & Ranking

Per pair, per timeframe: aggregate indicator scores into two numbers:

- **Confidence score** — how strong and how *agreeing* the signals are. Simple weighted average is a fine v1; the interesting part is agreement — if technical and fundamental indicators disagree, confidence should drop even if individual indicators are individually strong. Consider a penalty term for cross-category disagreement rather than pure averaging. See the Confidence Calibration subsection below for the v2 upgrade path once v1 has real backtest history to learn from.
- **Preserve indicator-family disagreement, don't just penalize and collapse it.** Alongside the single confidence number, keep the per-family breakdown (technical / derivatives-microstructure / options / on-chain / ML) as a structured record — e.g. "derivatives strongly bullish, options and on-chain disagree." A blended score with a disagreement penalty tells you confidence dropped; the breakdown tells you *why*, which is more useful for decision provenance (§1) and can itself be predictive — large cross-family disagreement is informative on its own, not just noise to average away.
- **Risk score** — independent axis, driven by: volatility (ATR relative to price), liquidity (mcap/volume ratio, and now genuine order-book depth per §3/§5 rather than a proxy), data completeness (how many indicators had usable data for this pair), and correlation to positions already held.
- **Expected Value** — a third first-class axis, not a replacement for the two above. High probability is not the same as a good trade: EV = P(win) × avg-win-payoff − P(loss) × avg-loss-payoff, using the calibrated probability from Confidence Calibration below combined with a payoff-distribution estimate from backtest history (§10) for that timeframe×cluster. A lower-probability, higher-payoff setup can have better EV than a high-probability, low-payoff one — and per the resolved question in §1, EV (not win rate) is one of the metrics that actually gates whether a timeframe trades live.

Then aggregate across timeframes per pair (a coin ranking highly on 1h but contradicted on 1d is a different trade than one aligned across all three) into a final per-pair ranking. **Rank, don't threshold, first** — take the top N candidates by confidence, then apply risk filtering, rather than a single blended score that can hide a great signal behind bad risk math or vice versa. Keep the two axes visible through to the portfolio construction step.

This whole layer is the part most likely to be overfit or to silently encode lookahead bias (e.g. an indicator that peeks at data not actually available at decision time). Budget real backtesting time here — walk-forward validation, not a single train/test split — before trusting it with capital. See the reference guide's warning: suspiciously high backtest accuracy usually means data leakage, not a working strategy.

### Timeframe Strategy Profiles

Indicator relevance differs by timeframe as much as by pair (§5's per-timeframe applicability table), so each traded timeframe gets its **own** validated indicator composition and weighting — not one global scheme reused across 15m, 1h, 4h, and 1d:

- Each timeframe is backtested (§10) independently, producing its own indicator inclusion set (via Indicator Relevance & Pruning below, now keyed on timeframe as well as cluster), its own confidence/risk/EV scoring weights, and its own minimum thresholds on **Expected Value, profit factor, and risk metrics** (max drawdown, tail loss, Deflated Sharpe Ratio — §10), tracked and required independently rather than blended into one portfolio-wide number. **Win rate is tracked and reported per timeframe but is diagnostic, not gating** — per the resolved design-principle question in §1, a hard win-rate floor risks rejecting a genuinely good asymmetric strategy for having a middling hit rate, which is exactly backwards for a system built around letting winners run.
- A timeframe that fails to clear its EV/profit-factor/risk thresholds simply doesn't trade live. Not every candidate timeframe needs to earn a permanent place in the rotation — a timeframe that never separates itself from noise in backtesting should be left out, not kept in at reduced weight, since a "weak but included" timeframe is exactly what a blended metric would hide.
- This is what makes "high win rate on each timeframe" a genuinely monitored outcome rather than an enforced target that could fight the trailing-stop design: win rate is watched closely per timeframe, but a timeframe earns its live place through EV and risk-adjusted metrics, not hit rate.

### Confidence Calibration (ML layer)

The confidence score above starts as a rule-based weighted average — reasonable for v1, but that's rules *encoding* intelligence, not learning it. Once there's real backtest history to learn from (not before — see §16's build order), close the gap deliberately narrowly rather than reaching for the most sophisticated-sounding option:

- **Model**: a gradient-boosted tree (LightGBM or XGBoost — free, CPU-only, no GPU budget needed) trained per (timeframe × cluster), predicting forward return or hit-probability. Train on **aggregated state features per category** — technical state, derivatives state, liquidity state, volatility state, cross-venue state, regime state, crowding state, execution state — rather than raw per-indicator values directly: the model learns "given this market state, what happens next" rather than memorizing specific indicator thresholds. This is a feature-engineering framing choice, not additional engineering scope — the same normalized indicator outputs feed in, just aggregated by category first. Narrow and well-understood beats a fancier architecture that's harder to validate on the data volumes free tools actually provide.
- **Calibration**: the raw model output gets calibrated into an actual probability (isotonic regression, or conformal prediction for distribution-free intervals) before it's used as "confidence" — this matters concretely because §9's Kelly-inspired position sizing is only as good as how well-calibrated that confidence really is. A ranking that's directionally right but badly calibrated will still size positions wrong.
- **Uncertainty is a separate output from probability, not implicit.** Two predictions can both say P(win) = 67% with very different reliability — conformal prediction's interval width (or ensemble spread, if an ensemble is used) already contains this information; name it explicitly as **epistemic uncertainty** and pass it through as its own field rather than discarding it once calibration produces a point probability. §8's Decision Policy treats "67% confident, low uncertainty" and "67% confident, high uncertainty" as materially different situations.
- **Feature importance feeds Indicator Relevance & Pruning below as a continuously-updating signal**, not just a periodic manual review — the model's own feature importances are a better-grounded input than eyeballing backtest output every week.
- **Champion/Challenger**: the live (champion) model is never the only model running. A challenger trains on the same inputs and runs in shadow mode — scored but never acted on — compared against the champion on calibration, EV, drawdown, regime-stability, and execution-adjusted performance. Promote it only after it beats the champion under predefined statistical rules (exact rules are an open question — see §15). This gives a controlled, continuous improvement loop without reaching for RL.
- **Drift detection**: monitor calibration drift (predicted vs. observed win rate over rolling windows), feature drift, and regime drift — alongside the "track relevance as a trend" bullet below, this is the same idea applied to the model itself rather than just individual indicators. Degradation detected here should trigger an automatic sizing reduction or profile disable, not wait for a drawdown to surface the problem after the fact.
- **Explicitly out of scope: reinforcement learning for sizing or exit timing.** It's the option that sounds most sophisticated and fits this system worst — sample-inefficient, prone to overfitting a non-stationary market, and genuinely hard to validate credibly on free-tier data volumes. If "AI-powered" needs to mean something concrete beyond the branding, the GBM/calibration/Champion-Challenger layer above is where that effort belongs, not RL.

### Indicator Relevance & Pruning

Not every indicator earns its keep on every pair *or* every timeframe, and running all of them everywhere unconditionally both wastes free-tier budget (some indicators cost an extra API call — on-chain data especially) and dilutes the score with noise. Backtesting (§10) is what decides relevance, not a one-time judgment call at build time:

- Periodically (e.g. weekly, alongside a scheduled backtest rerun), evaluate each indicator's **marginal contribution** to ranking accuracy, per (timeframe × cluster) — pair-level granularity is more precise but means up to 200 independent profiles per timeframe to maintain, so cluster-level (grouped by market-cap tier, volatility profile, or the regime detector's classification from §5) is the more practical starting point, escalating to per-pair only where backtesting shows real divergence within a cluster.
- Indicators with near-zero or negative marginal contribution for a (timeframe × cluster) combination get **excluded from live computation** there, not just down-weighted — this is what actually saves the compute/API budget, not merely a scoring adjustment. A funding-rate-trend indicator that's genuinely useless on 15m but valuable on 4h, for instance, should be computed on one and skipped on the other for the same pair.
- The regime detector (§5) provides a second, faster-updating layer on top of this: even an indicator that backtests well overall can be temporarily irrelevant (e.g. a mean-reversion indicator during a strongly trending regime) — the regime classification gates which indicator family is trusted right now, while the backtested relevance profile decides which indicators are worth computing at all for this pair/timeframe/cluster over the longer run.
- **Track relevance as a trend across successive re-evaluations, not just the latest snapshot.** An indicator quietly decaying over several straight weekly re-evaluations looks identical, in any single snapshot, to one that's just temporarily masked by the current regime — only the trend across snapshots tells the two apart, and only the trend view should trigger an actual prune.
- Granularity, the relevance threshold, and the re-evaluation cadence are all config values — see §17 — since the right tradeoff between precision and backtest cost is something you'll want to tune once you see real results, not something to hardcode now.

---

## 8. Opportunity Engine & Decision Policy

**Ranking is not a decision.** A candidate ranked #1 by §7 can still be the wrong trade right now — thin order-book depth, high model uncertainty, or a regime-incompatible setup can all mean a top-ranked candidate shouldn't be traded. This section is what actually decides, sitting between Scoring & Ranking and Portfolio Construction (§9).

**The Opportunity object**: each surviving ranked candidate gets packaged into a structured trade thesis, not left as a bare confidence/risk/EV triple:

- Pair, direction, entry zone, invalidation level
- **Invalidation conditions, plural — not just a price level**: the specific conditions (e.g. OI falls >8%, funding spikes past threshold, BTC breaks regime support, order-book imbalance flips, short-covering exhaustion detected) that would invalidate the thesis even before a price-based stop triggers. This is what turns "I like this trade" into "I like this trade while these conditions remain true" — and it's the input §12's Position Intelligence Engine re-checks against on every open position, not just a field that gets written once at entry and ignored.
- Expected holding horizon, tied to its timeframe
- Expected Value, P(win), and **uncertainty** (from §7's calibrated confidence and epistemic-uncertainty output), P(target hit)
- Expected MAE/MFE, estimated from backtest history (§10) for that timeframe×cluster — this specific field is a v2 capability, since it needs real backtest history to be more than a guess (see the sequencing note below)
- Regime compatibility, including regime-stability (§5's regime detector)
- **Execution-quality read**, from order-book depth/imbalance (§3, §5): signal quality and execution quality are different axes. A candidate can have a strong signal and a thin book at the intended size — that's not a reason to skip the trade, it's a reason to WAIT (below) until conditions improve
- Crowding level, derived from cross-venue funding/basis divergence + long/short ratio + OI (§5)
- Data confidence (§3) — a low-confidence data pair shouldn't produce a high-confidence Opportunity, regardless of what the raw indicator scores say

**Decision Policy — an expected-utility evaluation, not a threshold comparison.** The three-way TRADE/WAIT/NO_TRADE output doesn't change, but how it's reached does: evaluate whether executing now increases expected portfolio utility as a function of EV, uncertainty, execution cost, portfolio risk (§9), and tail risk together — not "confidence > X and EV > Y" checked independently. A high-EV opportunity with high uncertainty and a high-EV opportunity with low uncertainty should not clear the same bar.

- **TRADE**: expected utility clears the bar and execution conditions are workable now.
- **WAIT**: the setup itself is valid, but conditions aren't — e.g. book too thin at intended size right now. Distinct from NO_TRADE: the thesis stands, timing doesn't.
- **NO_TRADE**: expected utility doesn't clear the bar — low EV, uncertainty too high, or regime-incompatible. A top-1-ranked candidate can resolve here; rank is an input to the decision, not the decision itself.

**Schema reuse**: the Opportunity object is the natural payload for §1's decision-provenance snapshot — one structured format, not two. Every TRADE, WAIT, and NO_TRADE outcome gets logged with its full Opportunity object, which is what makes "why did the bot pass on this" answerable later, not just "why did it trade."

**Learned abstention**: don't just log WAIT/NO_TRADE decisions — track what actually happened afterward (did the passed-on opportunity turn out profitable, lose, or go nowhere). Aggregated over time, this is what lets the question "is our NO_TRADE policy systematically too conservative in transitioning regimes" get answered from evidence instead of intuition — see §10's "why not" attribution, which is where this aggregation actually happens.

**Sequencing**: this is explicitly a v2 module. EV and MAE/MFE estimates need real backtest history (§10) to be grounded rather than guessed, so it's built after Scoring & Ranking and the Backtesting Engine are proven — see §16's build order. A simpler threshold-based v1 (trade if confidence/EV clear a bar and order-book depth is adequate) is a reasonable stand-in until then.

---

## 9. Portfolio Construction & Risk Management

- **Top-N selection**: from the ranked list, take the top N candidates that pass minimum confidence and maximum risk thresholds (both configurable).
- **Correlation check**: crypto is highly correlated in risk-off moves. Selecting 10 "top ranked" coins that are all just BTC-beta plays defeats the diversification you're trying to buy. Cap exposure to any correlation cluster.
- **Incremental portfolio EV, not standalone trade EV**: a candidate's *marginal* contribution to portfolio EV — correlation-adjusted against what's already held — is what should drive admission, not its EV in isolation. A lower standalone-EV candidate with low correlation to the current book can improve the portfolio more than a higher standalone-EV candidate that's just another correlated bet on the same move. This is the mechanism the correlation-cluster cap above approximates crudely; incremental EV makes it a first-class sizing input rather than a cap alone.
- **Factor exposure (the more rigorous upgrade path from pairwise correlation clusters, not a replacement for them yet)**: latent factor exposure — BTC beta, broader market beta, L1/DeFi/meme-style factors — gives a truer aggregate risk read than pairwise correlation alone. Five nominally different positions can still add up to, say, 2.7x BTC-equivalent beta in a way a correlation-cluster cap won't surface cleanly. Factor construction methodology is genuinely open — see §15; this is a real added layer of modeling effort, not a free upgrade, so it's worth validating that incremental portfolio EV above doesn't already capture most of the value before committing to building it.
- **Position sizing**: scale by confidence (Kelly-inspired, capped — per the reference guide's approach) *and* inversely by risk score, not confidence alone. A max-position-size cap per trade and a max-total-exposure cap on the portfolio are both needed.
- **Notional size and leverage are two separate dials, not one.** Position sizing above decides *notional* exposure; leverage then decides how much margin backs that notional. Conflating them — "more confident → more leverage" directly — is a common mistake in derivatives bots. Confidence/risk should scale the notional size; leverage should be capped primarily by the liquidation-buffer check below, not by confidence.
- **Trailing stops**: this is your core "let winners run, cut losers fast" mechanism per your framing. Decide the trailing mechanism explicitly:
  - ATR-based trailing distance (wider stop on volatile coins, tighter on calm ones) generally beats a flat percentage trail across a 200-coin universe with wildly varying volatility profiles. For BTC/ETH specifically, widen the ATR multiplier when Deribit's forward-looking DVOL (§5) is elevated relative to current realized volatility — a purely backward-looking ATR stop will be too tight right before a vol expansion it hasn't seen yet.
  - Decide activation logic: trail from entry immediately, or only after price moves favorably by X% (avoids getting stopped out by entry noise).
  - Trailing stops handle the upside; you still want a hard stop-loss as a floor and can optionally use a take-profit *ratchet* (e.g. tighten the trail rather than a hard take-profit, since the goal is asymmetric upside capture).
  - **Liquidation-cascade awareness (speculative — validate before trusting)**: the liquidation feed (§5) could inform stop placement two ways — tightening the trail when a cascade is detected in your favor (lock in gains before a snap-back), or being aware of nearby known liquidation-cluster price levels when setting the initial stop (avoiding a stop placed right where cascade-driven slippage is worst). Flagged as one of the more speculative refinements in this doc — worth backtesting explicitly (§10) before it influences live stop logic, not assumed to work because it sounds plausible.
- **Portfolio-level circuit breakers**: max drawdown from peak (pauses new entries, doesn't necessarily force-liquidate), max daily trades (overtrading/fee bleed on a 200-coin scan universe is a real risk if the ranking is noisy), max concurrent positions.
- **Every risk parameter should be config, not code** — you'll be tuning these constantly during paper trading.
- **Leverage/margin extension (Bybit perpetuals — see §11):** because execution is perpetual futures, not spot, the RiskManager carries real liquidation risk on top of ordinary market risk. This isn't a separate module — it's additional state the same RiskManager tracks:
  - **Max leverage cap** per position, conservative by default (exact ceiling flagged as an open question in §15 — worth scaling inversely with a candidate's risk score rather than a single fixed number).
  - **Isolated margin per position** (not cross) as the default — one bad trade shouldn't threaten margin on every other open position.
  - **Liquidation-price buffer check, scenario-based rather than point-in-time**: a plain "is my stop safely inside my liquidation price *today*" check isn't enough — stress the buffer against the historical cascade-size distribution for that pair's cluster (built from the liquidation feed in §5, which by then has real data on how large cascades in that cluster have actually gotten). The question becomes *if a cascade of the size this cluster has historically produced hits right now, does my buffer still survive*, not just whether it's technically fine under current conditions. This also gives §15's still-open leverage-ceiling question an evidence-based starting point per cluster, instead of one fixed number picked with little to ground it.
  - **Funding rate as holding cost**: accrues over the position's life, feeds into both live P&L tracking and the Backtesting Engine's cost model (§10).
  - **Margin-ratio circuit breaker**: extends the drawdown breaker above — pause new entries if aggregate margin usage crosses a threshold, independent of P&L drawdown. Liquidation risk and drawdown risk are correlated on a leveraged, multi-coin book but not identical, so both breakers are needed.
  - **Regime-aware portfolio-level leverage throttle (distinct from the per-position cap above)**: keyed to the regime detector (§5) — when it flags elevated cascade frequency or a market-wide vol shift, tighten the max leverage ceiling across *all new entries*, not just the position being sized. Isolated margin (above) stops one position's liquidation from directly taking down another, but it does nothing to stop several individually-"safe" isolated positions from all getting squeezed in the same correlated risk-off window — that's a portfolio-level failure mode, and only a portfolio-level throttle catches it. The existing correlation-cluster cap (above) catches static correlation; this catches a regime-driven spike in *effective* correlation that the static cap wouldn't.
  - **Portfolio-level scenario stress test, run on every entry (formalizes the throttle above into a concrete pre-trade check)**: before admitting any new position, simulate a defined shock scenario (e.g. "BTC −6% in 20 minutes," propagated to other held positions via their beta/correlation to BTC) against the **current portfolio plus the candidate position together**, and reject or resize the entry if post-shock aggregate margin ratio would breach a threshold. The question this answers isn't "can this one position survive a shock" (that's the per-position liquidation buffer above) — it's **"can the whole book survive the same shock at once."** Scenario definition and magnitude are genuinely open — see §15.

---

## 10. Backtesting Engine

Elevated to its own module rather than a footnote — validates the *whole pipeline* (data → indicators → scoring → ranking → portfolio construction → risk rules) working together over historical windows, not just a single indicator or model in isolation. Depends on the Data Aggregation & Reconciliation layer (§3) already logging failover/divergence events, so simulations reflect realistic data gaps instead of assuming clean data was always available.

- **Full-pipeline replay**: re-run the actual scan-and-rank logic against historical data, not a simplified stand-in — this is what catches interaction bugs between scoring and risk rules that a per-component test would miss.
- **Survivorship bias check**: the top-200-of-Bybit-listed universe must be reconstructed *as it existed at each historical point in time* (both which coins were in the top 200 by mcap, and which had a Bybit perpetual listed then), not today's list applied retroactively — a backtest that quietly uses today's universe to trade last year is testing a universe that couldn't have existed at the time.
- **Realistic cost modeling**: ~0.1% trading fee, slippage modeled against **actual historical order-book depth** (§3, §5) at the simulated position size, rather than a flat per-liquidity-tier assumption — this is a meaningfully closer approximation of what §11's Execution Intelligence layer will actually experience live, plus **funding rate accrual** over each simulated holding period (new requirement from trading Bybit perpetuals rather than spot — see §11).
- **Stop/trail execution mid-simulation**: runs the same ATR-based trailing-stop logic specified for live trading (§9), not a simplified take-profit/stop-loss stand-in.
- **Walk-forward validation** across multiple regimes (bull, bear, chop) — a single train/test split is insufficient; this is where §13's validation gates #1 and #2 actually get implemented, not just stated as a goal.
- **Multiple-comparisons discipline (new — this is the sharpened overfitting risk below, made concrete)**: ~200 coins × several timeframes × cluster-level relevance profiles re-evaluated weekly is a real multiple-comparisons problem — standard walk-forward validation alone doesn't fully protect against one (timeframe × cluster) combination looking great purely because it's effectively one of dozens tried, with the best one reported. Two established, free (algorithms, not paid tools) techniques close that gap: **Combinatorial Purged Cross-Validation** (López de Prado) for the purging/embargo discipline multi-feature financial models specifically need to avoid leakage between overlapping windows, and a **Deflated Sharpe Ratio** applied to backtest outputs, which explicitly discounts the best result by how many (timeframe × cluster) combinations were effectively tried to find it.
- **Per-timeframe profile validation**: because each timeframe now runs its own Timeframe Strategy Profile (§7), results are reported *per timeframe*, not just blended across the whole book — a strong overall equity curve can hide one timeframe quietly losing money, which a single blended number would mask. EV, profit factor, and risk metrics (max drawdown, tail loss, Deflated Sharpe Ratio) are reported and floored **independently per timeframe** — a timeframe only goes live once it clears its own thresholds on those. Win rate is reported per timeframe alongside them **as a diagnostic, not a gate** (§1, §7) — visible for every timeframe, but not what decides whether it trades live.
- **Outputs**: equity curve, max drawdown, EV, profit factor, win rate (diagnostic — all broken out per timeframe as above), and **per-indicator contribution, per (timeframe × cluster)** — which signals actually drove ranking winners vs. losers for which kind of pair on which timeframe, feeding directly into §7's Indicator Relevance & Pruning rather than just informing a one-time manual prune.
- **Overfitting warning, sharpened for this system**: a 200-coin multi-indicator, multi-timeframe ranking system has *more* places for lookahead bias to hide than a single-pair model (survivorship bias above is one concrete example, and per-timeframe overfitting — a profile that looks great on 15m purely from noise — is another). Suspiciously strong backtest results here deserve more suspicion, not less, than the reference guide's original single-model warning.

### Trade Attribution Engine

Distinct from the per-indicator contribution output above (which is about *ranking accuracy* — did the signals point the right way) — this is about *where realized P&L actually came from*, post-hoc, per closed trade:

- Decompose each closed trade's P&L into: signal attribution, regime-selection attribution, entry-timing attribution, execution attribution, slippage, exit attribution, funding cost. Aggregated over many trades, this answers "where is the system's apparent edge actually leaking" — e.g. good directional forecasts (strong signal attribution) but a meaningful chunk of edge lost to execution and slippage, which points straight at §11's Execution Intelligence rather than at the indicators.
- Consumes the decision-provenance snapshot (§1, §8's Opportunity object) as its input — this is exactly why that snapshot schema needs to be shared between backtesting and live trading from the start, not designed twice: attribution needs to compare what was known/decided at entry against what actually happened at exit, for both simulated and live trades, using the same structure.
- Without this, a losing period only tells you *that* the system lost money, not *why* — whether the ranking logic is wrong, the execution layer is bleeding edge, or funding costs are eating a thin edge alive on longer-held positions.
- **"Why not?" attribution — a sibling output, for candidates that didn't trade.** For every WAIT/NO_TRADE decision (§8's learned abstention), log the reason codes (EV, uncertainty, risk, execution quality, data confidence) and aggregate them the same way executed-trade P&L gets decomposed above — e.g. "42% of NO_TRADE decisions were EV-driven, 31% risk, 14% execution, 9% uncertainty, 4% data confidence." That aggregate is what lets the Decision Policy's rejection criteria (§8) get tuned from evidence about what NO_TRADE decisions actually cost or saved, not just from what executed trades made or lost.

---

## 11. Execution

Venue is decided: **Bybit, perpetual futures (derivatives) only** — no spot. This is a real risk-model choice (leverage, liquidation, funding, margin mode), reflected in the RiskManager extension in §9, not just a name swap.

- **Adapter**: Bybit V5 unified API via CCXT — first-class supported exchange, every order type and endpoint implemented and tested.
- **Paper trading backend**: **Bybit testnet** (`api-testnet.bybit.com`) rather than a hand-rolled fill simulator, behind the same `ExecutionAdapter` interface. Real matching, margin, and funding mechanics give much closer fidelity to live behavior than simulated fills — §13's "paper trade 30 days" gate runs against testnet, not a mock.
- **Trailing stops**: implemented as **exchange-native** via Bybit's `/v5/position/trading-stop` endpoint, not client-side polling. Lower latency, and the stop survives a bot restart or disconnect since it lives on the exchange, not in local process state.
- **Rate-limit budget**: order placement capped at 120 req/5s (~24/sec sustained); general API 600 req/5s per IP; WebSocket supports up to 200 subscriptions/connection at sub-50ms updates. The fast position-monitoring loop from §4 needs its own budget line here — perpetuals require watching more fields per open position (funding rate, mark price, margin ratio, liquidation price) than spot did, so size that loop's cadence against these real numbers, not an assumption of unlimited headroom.
- **Universe/execution gap: resolved.** Because the Universe Manager (§4) now builds the top-200 list from Bybit's own listed perpetual contracts first, then ranks by market cap, every pair the system scans is by construction tradable at this venue — no separate intersection step, no scan-but-can't-execute mismatch.
- **Keys**: trading-only API permissions (no withdrawal rights), stored via environment variables / secrets manager, never committed.

### Execution Intelligence

The doc so far is detailed about *what* to trade and *how much* — this covers *how the order actually gets placed*, which matters because a naive market order on a bottom-half-of-200 pair, sized off a confidence score, can eat slippage that undoes the ranking's edge before the trade is even open:

- **Post-only limit first, market fallback second**: attempt a post-only limit order near the best price; if it doesn't fill within a short timeout, fall back to a market order. Stays entirely within "free tools only" since it's just using Bybit's existing order types more deliberately, not a new integration.
- **Order slicing for larger clips**: size the position against the order-book depth data (§3, §5) — if the intended notional would meaningfully move the book at current depth, slice it into smaller sequential clips rather than one full-notional order.
- **Alpha-decay awareness in the post-only/market-fallback timeout**: each Opportunity (§8) carries an expected EV-decay rate. A fast-decaying setup shouldn't wait as long for a better maker fill as a slow-decaying one — waiting 5 minutes to save on slippage can destroy more expected value than it saves if the opportunity itself is decaying at 0.15R/minute, whereas the same wait is easy money on a setup decaying at 0.01R/minute. The timeout in the bullet above should be a function of decay rate, not a single fixed constant.
- This is genuinely the difference between a system that predicts well and one that captures what it predicts — an edge that exists in the ranking but gets given back in slippage is not a real edge. It's also a meaningful chunk of where the reference guide's 20-30% backtest-to-live gap tends to come from in practice, which is why §10's slippage modeling gets upgraded to use real depth data rather than a flat per-tier assumption.

---

## 12. Position Intelligence Engine

**"What should we trade" (§8) and "what should we do with what we already own" are different questions.** The existing trailing-stop mechanics (§9) are mechanical and price-based — they react to price moving against or in favor of a position, but nothing re-checks whether the *thesis* that justified the trade still holds. This section is that check, sitting after a position opens and looping back into the Risk Manager (§9) and Execution Adapter (§11) whenever it calls for action.

- **Periodic re-evaluation, not just stop-watching**: for each open position, re-check its original Opportunity object (§8) against current state — are the invalidation conditions (§8) triggering even though the price-based stop hasn't been hit, has portfolio concentration changed since entry (§9), has EV moved, has the regime shifted to TRANSITIONING or UNKNOWN (§5)?
- **Outputs**: HOLD / ADD / REDUCE / EXIT / TIGHTEN_STOP / WIDEN_STOP. These feed into the existing Risk Manager and Execution Adapter — this module decides, it doesn't place orders or resize positions itself, same separation of concerns as the Opportunity Engine / Decision Policy split in §8.
- **Why this matters concretely**: the bot should be able to conclude "the original thesis is deteriorating, the stop hasn't been hit, but expected value is now negative — exit" or "the thesis strengthened, but portfolio concentration is now too high — reduce rather than exit." A purely price-based trailing stop can't make either distinction; it only knows where price is relative to the stop level.
- **Sequencing**: this depends on the Opportunity object (§8) already being populated for open positions, so it's naturally a later build step, after §8 itself is proven — see §16.

---

## 13. Validation & Rollout Gates

Straight from hard-won lessons in the reference guide, and worth treating as literal go/no-go gates rather than suggestions:

1. **Backtest** across multiple market regimes (bull, bear, chop) — a strategy that only works in one regime isn't a strategy, it's a curve fit.
2. **Walk-forward validation**, not a single split — retrain/rescan on rolling windows to catch regime-dependent overfitting.
3. **Paper trade minimum 30 days** on Bybit testnet before any real capital.
4. **Start live with 5-10% of intended capital**, scale up only after paper-trading performance roughly holds in live conditions (expect it to be 20-30% worse, per the guide — if it's *dramatically* worse, stop and re-diagnose before scaling).
5. **Kill switches must be automatic** (drawdown circuit breaker, margin-ratio circuit breaker, daily-loss limit), not "I'll watch it and turn it off if it goes bad."
6. **Per-timeframe floors on EV, profit factor, and risk metrics**: a timeframe only trades live once its backtested Expected Value, profit factor, and risk metrics (max drawdown, tail loss, Deflated Sharpe Ratio) all clear their configured minimums independently (§7, §8, §10, §17) — no blended portfolio-wide number gets to paper over a timeframe that hasn't earned its place. Win rate is reported per timeframe but does not gate (§1, §7).

---

## 14. Tech Stack Recommendation

- **Language**: Python — every library named above (CCXT, pandas, scikit-learn, PyTorch if you go deep-learning later) is Python-native; also fine for the orchestration/scheduling.
- **Storage**: SQLite to start (zero-ops, free, plenty for this scale); migrate to Postgres if/when you add concurrent writers or want proper time-series indexing (TimescaleDB free tier is an option later).
- **Scheduling**: APScheduler or plain cron for v1; only reach for something heavier (Airflow, Celery) if the pipeline complexity actually demands it.
- **Alerting/monitoring**: Telegram bot or Discord webhook (both free, low-effort) for trade notifications and circuit-breaker triggers — you want to know immediately when a breaker trips. Push alerts alone don't give ongoing situational awareness, though — worth a lightweight live dashboard alongside them (live rankings, position P&L against liquidation buffer and funding accrual, per-timeframe win-rate/profit-factor floor status): a small local FastAPI/Flask service reading the same SQLite/Postgres store, or a free Grafana instance pointed at it, both stay inside the free-tools constraint. New build either way — nothing here assumes prior tooling.
- **Backtesting**: hand-rolled is fine given the custom multi-indicator ranking logic and the full-pipeline replay described in §10 (a generic backtesting library like `backtesting.py` or `vectorbt` — both free/open-source — can accelerate parts of it but wasn't built for a 200-asset ranking system, so treat it as a starting point, not a fit).

---

## 15. Open Questions / Things Still To Decide

These are the genuine unknowns worth resolving before or during early build — flagged rather than answered, since they're judgment calls:

- **How to handle thin/sparse data for lower-ranked coins in the 200?** (fallback scoring tier, as noted in §3)
- **Reconciliation strictness**: when two data sources diverge beyond tolerance (§3), should the pair be skipped for that cycle (safe, costs coverage) or scored with a reduced-confidence penalty (keeps coverage, costs some accuracy)?
- **Max leverage cap** (§9, §11): the scenario-based liquidation buffer now gives a *methodology* for setting this per cluster (stress against historical cascade-size distribution), but the actual multiplier/ceiling is still an open number until there's cascade-size data to stress against.
- **ML confidence layer specifics** (§7): LightGBM vs. XGBoost, isotonic regression vs. conformal prediction for calibration, and — the more practical concern — whether free-tier data volumes per (timeframe × cluster) are actually sufficient to train a model that generalizes, rather than one that memorizes a small sample. Worth explicitly checking sample sizes before committing engineering time here.
- **CPCV/embargo window sizing and Deflated Sharpe Ratio threshold** (§10): both techniques are decided on, but their parameters (purge/embargo window length, minimum acceptable deflated Sharpe) need real backtest data to set sensibly, not a guess baked into this doc.
- **Execution slicing thresholds** (§11): what notional-vs-depth ratio triggers slicing into multiple clips vs. a single order, and how many clips/what pacing between them?
- **Indicator relevance granularity** (§7): per-pair or per-cluster pruning? Per-pair is more precise but means up to 200 independent relevance profiles to maintain and re-validate; per-cluster is cheaper to compute and likely captures most of the benefit — worth starting with clusters and only going per-pair where backtesting shows real divergence within a cluster.
- **Regime detector methodology** (§5): ADX-threshold classification is simple and cheap; a Hurst-exponent estimate is more principled but adds computation and its own tuning burden. Worth prototyping both against backtest data before committing.
- **EV, profit-factor, and risk-metric floor values, per timeframe** (§7, §10, §13): no defaults exist yet and none should be guessed into this doc — the first backtesting round should propose starting points from actual data, not intuition.
- **EV estimation methodology** (§7, §8): once backtest history exists, how exactly is the payoff distribution estimated per (timeframe × cluster) — parametric fit, empirical distribution, something else — and how much history is "enough" to trust it?
- **Decision Policy WAIT-vs-NO_TRADE thresholds** (§8): what specific execution-quality/order-book conditions distinguish "wait for a better moment" from "the setup itself is bad"? Currently a conceptual distinction, not a quantified one.
- **Portfolio stress-test scenario definition** (§9): what shock magnitude/timeframe (e.g. "BTC −6% in 20 minutes") and what beta/correlation propagation model to other held positions — needs real historical shock data to calibrate, not an arbitrary number.
- **Liquidation-cascade stop logic** (§9): lean into detected cascades (tighten stops, ride the momentum) vs. treat them as a slippage hazard to route stops around? Flagged explicitly as speculative and unvalidated — genuinely untested territory, not a settled design choice.
- **Rebalance cadence for the top-N portfolio** — replace a held position the moment something ranks higher, or require a minimum holding period to avoid churn/fee and funding-rate bleed?
- **How much of the "AI" is ML-model-based (per the reference guide's Random Forest approach) vs. rule-based indicator scoring?** They're not mutually exclusive — a model could learn the *weights* for combining indicators rather than being the sole decision-maker — but this is a real architecture choice with different validation burdens.
- **Multi-asset-class timeline** — is equities/forex a "someday" driver of the interface design, or an actual near-term milestone? Affects how much abstraction overhead is worth paying for now vs. later.
- **Market Memory similarity metric** (§6): nearest-neighbor on raw feature distance, a learned embedding, or something else — and how much logged history counts as "enough" before analog retrieval is trustworthy rather than noise.
- **Position Intelligence Engine re-evaluation cadence** (§12): how often should open positions get re-checked against their thesis — every scan cycle (same cadence as new-candidate scanning) or a separate, cheaper cadence? Too frequent risks thrashing on noise; too infrequent defeats the purpose.
- **Factor exposure model construction** (§9): which factors, how are they estimated (regression against a basket, PCA on historical returns, something else), and how often do they get re-estimated as market structure shifts?
- **Champion/Challenger promotion rules** (§7): exact statistical criteria and required shadow-mode duration before a challenger replaces the champion — needs to be strict enough to avoid promoting a model that got lucky, not yet specified.
- **Decision Policy expected-utility function** (§8): the actual functional form combining EV, uncertainty, execution cost, portfolio risk, and tail risk into one utility score is unspecified — this is the single most consequential open question in the doc, since it's what the whole Decision Policy rests on, and it deserves real modeling attention once there's backtest data to fit it against rather than an arbitrary formula chosen now.

---

## 16. Suggested Build Order (Phase 1: Crypto)

1. Data Layer + Universe Manager (Bybit-listed-first, top 200 by mcap) + Data Aggregation & Reconciliation, with failover logging in place — order book depth and cross-venue funding fold in here too, since both reuse infrastructure this step already builds
2. Indicator Engine, in this order: technical first (baseline) → derivatives positioning (funding/OI/long-short, order-book imbalance, cross-venue divergence — cheap since it's already-fetched data) → liquidation cascade detection + mark-index divergence (new WebSocket integration, more engineering effort) → fundamental/on-chain (thinnest free-data coverage) → options IV/skew for BTC/ETH (second exchange integration, narrowest scope) → custom/composite indicators and regime detector last, once all raw inputs above are proven
3. Scoring & Ranking (start simple — weighted average — before adding disagreement penalties or ML; the Confidence Calibration ML layer in §7 is explicitly a v2, built only once there's real backtest history to train on, not part of this step)
4. Backtesting Engine (§10), **built alongside decision provenance (§1) from the start, not after**: the structured decision-object schema needs to be shared between backtesting and live trading from day one (research/live parity) — retrofitting it later means the research environment can't faithfully reproduce why live Sisera made a decision. Validates the full pipeline (#1-#3 together); needs #1's reconciliation logging in place first so simulations reflect realistic data gaps; CPCV and Deflated Sharpe Ratio get built in here from the start too, for the same "hard to retrofit" reason
5. Timeframe Strategy Profiles + Indicator Relevance & Pruning (§7) — only meaningful once #4 exists to drive it; don't build the pruning/profile mechanism before there's per-timeframe backtest output to validate against. Confidence Calibration (ML layer), including the explicit uncertainty output, also belongs here, once #4 has produced enough history to train on
6. Opportunity Engine & Decision Policy (§8) — needs #4's backtest history for EV/MAE/MFE estimates to be grounded rather than guessed; a simpler threshold-based version can stand in until then, per §8's sequencing note. Invalidation conditions are part of the Opportunity object from the start here, since §12 depends on them existing
7. Risk Manager + Portfolio Construction (sizing, ATR-based trailing stops, leverage/margin limits, circuit breakers, scenario-based liquidation buffer, regime-aware portfolio leverage throttle, portfolio-level scenario stress test, incremental portfolio EV) — liquidation-cascade stop logic (§9) and factor exposure modeling explicitly last and optional, both flagged speculative/open
8. Execution Adapter — build and test against **Bybit testnet** first (native trailing-stop calls, order placement) before any live-key work; Execution Intelligence (post-only/market-fallback, order slicing, alpha-decay-aware timeout — §11) layers on once basic order placement is proven, not before
9. Orchestrator/scheduler tying the loop together, + monitoring/alerts + live dashboard (§14); Trade Attribution Engine including "why not" attribution (§10) layers on once real trade and WAIT/NO_TRADE history exists to attribute
10. Position Intelligence Engine (§12) — depends on #6's Opportunity object being populated for open positions already, so it naturally follows Execution being live in at least paper mode
11. Champion/Challenger and drift detection (§7) — layer onto the Confidence Calibration model from #5 once it's been live (paper or real) long enough to have a track record to challenge against
12. Market Memory (§6) — deliberately last: needs substantial accumulated decision-provenance history (§1) from the steps above before analog retrieval has anything useful to query
13. 30-day paper trading run on testnet, tune each timeframe against its EV/profit-factor/risk-metric floors (win rate watched, not gated), then small-capital live per §13 — only for timeframes that actually cleared their floors

---

## 17. Configuration Surface

Everything below should be a config value the bot reads at startup (or hot-reloads), never a hardcoded constant — collected here as a single reference so the config schema can be designed once rather than discovered piecemeal while building each module. Grouped by the section that owns each parameter:

| Parameter | Owning section | Why it needs to be tunable |
|---|---|---|
| Universe size (currently 200) | §3, §4 | Trading off scan cost/cadence against breadth is an ongoing decision, not a one-time one |
| Data reconciliation tolerance (currently ~1%) and on-divergence behavior (skip vs. penalize) | §3 | Depends on how noisy real provider data turns out to be in practice |
| Timeframe matrix per indicator category | §4 | Which timeframes matter is itself a backtest finding, likely to change |
| Indicator relevance threshold, granularity (per-pair vs. per-cluster, per-timeframe), re-evaluation cadence | §7 | Precision-vs-cost tradeoff that should move as the backtest suite matures |
| EV floor, profit-factor floor, and risk-metric floors (drawdown, tail loss, Deflated Sharpe), per timeframe | §7, §8, §10, §13 | Independent hard-gate thresholds — values are a backtest finding, not a fixed spec |
| Win-rate reporting (diagnostic only, no gating threshold) | §1, §7, §10 | Tracked per timeframe for visibility; deliberately not a config gate per the resolved design decision |
| Decision Policy WAIT-vs-NO_TRADE thresholds (execution-quality/order-book conditions) | §8 | Genuinely undecided — needs real order-book behavior observed before setting sensibly |
| Portfolio stress-test scenario (shock magnitude/timeframe, beta propagation model) | §9 | Needs historical shock data to calibrate rather than an arbitrary number |
| Per-timeframe indicator applicability mapping (§5's starting hypothesis) | §5, §7 | Meant to be overturned by backtesting, not treated as fixed once written down |
| Liquidation-cascade detection threshold (notional/time window) and stop-logic mode (lean-in vs. avoid, or off) | §5, §9 | Speculative feature — needs to be tunable/disableable until backtesting validates it one way or the other |
| Options IV/skew inclusion toggle and weight (BTC/ETH only) | §5 | Scoped narrowly on purpose; a toggle keeps it easy to disable if the Deribit integration proves not worth its complexity |
| Order-book imbalance threshold, depth levels pulled | §5, §11 | Tunable signal-vs-noise dial, and directly trades off against rate-limit budget at higher depth tiers |
| Cross-venue funding divergence threshold | §5 | How large a Bybit-vs-cross-venue gap counts as a real signal is a backtest finding |
| GBM confidence model retrain cadence, calibration method | §7 | Model staleness and calibration drift both need a tunable refresh cycle, not a train-once assumption |
| CPCV purge/embargo window size, minimum Deflated Sharpe Ratio | §10 | Validation-rigor parameters that should be set from real backtest data, not guessed |
| Scenario-based liquidation buffer stress multiplier (per cluster) | §9 | Directly determines how conservative the leverage ceiling ends up being per cluster |
| Regime-aware portfolio leverage throttle sensitivity | §9 | How aggressively to de-risk the whole book on a regime shift is a real risk-appetite dial |
| Execution slicing size threshold, post-only timeout before market fallback | §11 | Balances slippage avoidance against fill-certainty, and depends on real depth/latency observed live |
| Confidence / risk thresholds for candidate inclusion | §7, §9 | Core dial for how aggressive vs. conservative the bot is |
| Top-N portfolio size, correlation/beta cap, max positions | §9 | Diversification-vs-concentration tradeoff, tuned during paper trading |
| Position sizing curve (confidence/risk → size) | §9 | The Kelly-inspired formula's aggressiveness is exactly what 30 days of paper trading should calibrate |
| ATR trailing-stop multiplier, activation threshold | §9 | Volatility regimes change; a static multiplier picked once will go stale |
| Max leverage cap (fixed or risk-score-scaled), margin mode | §9, §11 | Direct dial on how much liquidation risk the bot is allowed to take on |
| Max drawdown %, margin-ratio breaker threshold, daily trade limit | §9 | Kill-switch thresholds are exactly the kind of thing you want to tighten after a bad week without a code change |
| Backtest regime windows, walk-forward split parameters | §10 | Needed to test the strategy against different historical periods without rewriting the harness each time |
| Scan cycle interval, position-monitoring loop interval | §4, §11 | Directly trades off signal freshness against free-tier rate-limit budget |
| Epistemic uncertainty threshold (feeds Decision Policy's expected-utility evaluation) | §7, §8 | Distinguishes "confident and reliable" from "confident but unreliable" — a real dial on how conservative the Decision Policy is |
| Regime-stability threshold (STABLE/TRANSITIONING/UNKNOWN cutoffs) | §5 | Determines how aggressively confidence decays on a regime shift — too sensitive and it thrashes, too loose and it misses real transitions |
| Data confidence component weights (freshness, cross-source agreement, coverage) | §3 | How much each component matters for the combined score is a judgment call worth tuning against real data behavior |
| Position Intelligence Engine re-evaluation cadence | §12 | Too frequent risks thrashing on noise, too infrequent defeats the purpose of thesis re-checking |
| Champion/Challenger promotion criteria and minimum shadow-mode duration | §7 | Needs to be strict enough that a lucky challenger doesn't get promoted prematurely |
| Drift-detection thresholds (calibration, feature, regime drift) | §7 | Sets how much degradation triggers an automatic sizing reduction or profile disable |
| Incremental portfolio EV correlation weighting, factor exposure limits | §9 | Both are real risk-appetite dials once the underlying models exist to compute them |
| Market Memory similarity-search parameters (metric, k neighbors, minimum history before trusting a query) | §6 | Genuinely undecided — see §15 — and this is a v3+ module regardless, so low urgency |
| Decision ledger fields (`model_version`, `strategy_profile_version`, `risk_policy_version`, `execution_policy_version`) | §1 | Not tunable values so much as required schema fields — listed here so the config/schema design happens once, alongside everything else |

This list will grow as modules get built — treat it as living documentation of the config schema, not a final spec.
