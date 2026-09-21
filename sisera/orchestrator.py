"""Orchestrator & Main Pipeline. See SCOPE.md §2, §4, §14.

Ties the intelligence stack together end-to-end:
Observe -> Understand -> Predict -> Decide -> Optimize -> Execute -> Reassess -> Learn
Coordinates scan cycles, fast position monitoring sub-loops, position intelligence,
decision provenance recording, and alerting.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass
from typing import Any

from sisera.alerts import AlertManager, AlertType
from sisera.backtest.attribution import TradeAttributionEngine
from sisera.config import config
from sisera.data.bybit import BybitClient
from sisera.data.cache import Cache
from sisera.data.defillama import DeFiLlamaClient
from sisera.data.fred import FREDClient
from sisera.data.models import (
    CoinMarketData,
    LLMFundamentalAssessment,
    MacroSnapshot,
    NewsAssessment,
    NewsItem,
    OrderBook,
    Ticker,
    UniversePair,
)
from sisera.data.news_feed import NewsFeedClient
from sisera.data.openrouter import OpenRouterClient
from sisera.data.telegram_news import TelegramNewsMonitor
from sisera.data.x_client import XClient
from sisera.execution.adapter import (
    ExecutionAdapter,
    OrderRequest,
    PaperExecutionAdapter,
)
from sisera.execution.intelligence import ExecutionIntelligence
from sisera.indicators.engine import IndicatorEngine, MarketSnapshot
from sisera.ledger.ledger import DecisionLedger
from sisera.ledger.models import DecisionLedgerEntry
from sisera.opportunity.engine import OpportunityEngine
from sisera.opportunity.models import DecisionType, Opportunity, TradeDirection
from sisera.opportunity.policy import DecisionPolicy
from sisera.position.engine import PositionIntelligenceEngine
from sisera.position.models import PositionAction
from sisera.risk.manager import RiskManager
from sisera.risk.models import PortfolioState, Position
from sisera.scoring.event_attribution import EventAttributionEngine
from sisera.scoring.llm_track_record import LLMTrackRecord
from sisera.scoring.models import PairScore, RankedCandidate
from sisera.scoring.news_relevance import CorroborationTracker, SeenNewsStore, build_alias_map, match_symbols
from sisera.scoring.ranking import RankingEngine
from sisera.scoring.relevance import IndicatorRelevancePruner, classify_market_cap_cluster
from sisera.scoring.scorer import ScoringEngine
from sisera.strategy.convex_growth import ConvexGrowthStrategy
from sisera.universe import UniverseManager

logger = logging.getLogger(__name__)


@dataclass
class ScanCycleReport:
    """Summary of one full-universe scan cycle."""

    timestamp_ms: int
    scanned_pairs_count: int
    ranked_candidates_count: int
    trades_executed_count: int
    waits_count: int
    no_trades_count: int
    top_candidates: list[RankedCandidate]
    circuit_breakers_tripped: list[str]


class Orchestrator:
    """Main Sisera Trading Bot Orchestrator."""

    def __init__(
        self,
        universe_manager: UniverseManager | None = None,
        bybit_client: BybitClient | None = None,
        indicator_engine: IndicatorEngine | None = None,
        scoring_engine: ScoringEngine | None = None,
        ranking_engine: RankingEngine | None = None,
        opportunity_engine: OpportunityEngine | None = None,
        decision_policy: DecisionPolicy | None = None,
        risk_manager: RiskManager | None = None,
        execution_adapter: ExecutionAdapter | None = None,
        position_intelligence: PositionIntelligenceEngine | None = None,
        ledger: DecisionLedger | None = None,
        alert_manager: AlertManager | None = None,
        initial_capital: float = 10_000.0,
    ) -> None:
        self.universe_manager = universe_manager or UniverseManager()
        self.bybit_client = bybit_client or BybitClient()
        self.indicator_engine = indicator_engine or IndicatorEngine()
        self.scoring_engine = scoring_engine or ScoringEngine()
        self.ranking_engine = ranking_engine or RankingEngine()
        self.opportunity_engine = opportunity_engine or OpportunityEngine()
        self.decision_policy = decision_policy or DecisionPolicy()
        self.risk_manager = risk_manager or RiskManager()
        self.execution_adapter = execution_adapter or PaperExecutionAdapter(
            initial_balance=initial_capital
        )
        self.exec_intelligence = ExecutionIntelligence(self.execution_adapter)
        self.position_intelligence = position_intelligence or PositionIntelligenceEngine()
        self.ledger = ledger or DecisionLedger()
        self.alert_manager = alert_manager or AlertManager()
        self.convex_strategy = ConvexGrowthStrategy()
        self.initial_capital = initial_capital

        # LLM Fundamental Analysis + Breaking News Monitor -- live/paper-forward only (see
        # NOT_BACKTESTABLE_INDICATORS in backtest/engine.py). Off unless explicitly
        # enabled: paid APIs, opt-in by design. Both share one OpenRouterClient/API key.
        self.relevance_pruner = IndicatorRelevancePruner()
        self.llm_enabled = config.enable_llm_fundamental_analysis
        self.news_enabled = config.enable_news_monitor

        if self.llm_enabled or self.news_enabled:
            self.openrouter_client = OpenRouterClient()
            if not self.openrouter_client.is_configured:
                logger.warning(
                    "LLM fundamental analysis or news monitor enabled but "
                    "SISERA_OPENROUTER_API_KEY is unset -- both will be skipped every cycle."
                )

        if self.llm_enabled:
            self.llm_cache = Cache(config.cache_db_path)
            self.llm_track_record = LLMTrackRecord(
                db_path=config.ledger_db_path,
                relevance_pruner=self.relevance_pruner,
                indicator_name="llm_fundamental_analysis",
            )

        if self.news_enabled:
            self.news_feed_client = NewsFeedClient()
            self.telegram_news_monitor = TelegramNewsMonitor()
            self.seen_news_store = SeenNewsStore(db_path=config.cache_db_path)
            self.news_track_record = LLMTrackRecord(
                db_path=config.ledger_db_path,
                relevance_pruner=self.relevance_pruner,
                indicator_name="news_sentiment",
                resolve_after_hours=config.news_resolve_after_hours,
            )
            # Event Attribution Engine (per-source empirical reliability) and
            # corroboration tracking -- see sisera/scoring/event_attribution.py,
            # sisera/scoring/news_relevance.py. Both feed extra_context into
            # assess_news_headline() so the model's source-reliability weighing has real
            # data behind it instead of pretrained guesswork about outlet reputation.
            self.event_attribution_engine = EventAttributionEngine(
                db_path=config.ledger_db_path,
                resolve_after_hours=config.news_resolve_after_hours,
                min_settled_for_score=config.event_attribution_min_settled_for_score,
                rolling_window=config.event_attribution_rolling_window,
            )
            self.corroboration_tracker = CorroborationTracker(
                db_path=config.cache_db_path,
                window_seconds=config.news_corroboration_window_seconds,
            )
            if not self.telegram_news_monitor.is_configured:
                logger.info(
                    "News monitor enabled with RSS only -- no Telegram channels configured "
                    "(see SISERA_TELEGRAM_NEWS_CHANNELS and scripts/telegram_login.py)."
                )

        # Macro Data (FRED/Treasury yields/CPI, DeFiLlama TVL) -- free, defaults on. Feeds
        # the macro_regime indicator (sisera/indicators/macro.py), not gated behind the
        # same paid-API switch as llm_enabled/news_enabled above.
        self.macro_enabled = config.enable_macro_regime_indicator
        if self.macro_enabled:
            self.fred_client = FREDClient()
            self.defillama_client = DeFiLlamaClient()
            self.macro_cache = Cache(config.cache_db_path)

        # X/Twitter Ingestion -- OFF by default. Real recurring paid cost with no free
        # tier; building this was an explicit user decision, not this project's default
        # posture for a new data source. See sisera/data/x_client.py, x_spend_tracker.py.
        self.x_enabled = config.enable_x_ingestion
        if self.x_enabled:
            self.x_client = XClient()
            if not self.x_client.is_configured:
                logger.warning(
                    "X ingestion enabled but SISERA_X_BEARER_TOKEN is unset -- will be "
                    "skipped every cycle."
                )

        # Dashboard-facing history: recently classified news events and recently closed
        # trades' P&L attribution. Unconditional (not gated behind news_enabled/etc.) and
        # cheap -- both are bounded in-memory lists, same "small, in-memory, no I/O"
        # pattern as AlertManager.sent_alerts. Feeds sisera/interfaces/web/routes.py's
        # /event-intelligence and /attribution endpoints.
        self.attribution_engine = TradeAttributionEngine()
        self.recent_news_events: list[dict[str, Any]] = []
        self.recent_trade_attributions: list[dict[str, Any]] = []

        self.portfolio = PortfolioState(
            cash_balance=initial_capital,
            equity=initial_capital,
            peak_equity=initial_capital,
        )
        self.active_opportunities: dict[str, Opportunity] = {}
        self.current_universe: list[UniversePair] = []

    def refresh_universe(self, force_refresh: bool = False) -> list[UniversePair]:
        """Refreshes the tradable top Bybit-listed perpetuals universe (§4)."""
        self.current_universe = self.universe_manager.get_universe(force_refresh=force_refresh)
        logger.info("Orchestrator refreshed universe: %d pairs", len(self.current_universe))
        return self.current_universe

    def _get_llm_fundamental(
        self, symbol: str, upair: UniversePair, ticker: Ticker
    ) -> LLMFundamentalAssessment | None:
        """Returns a cached-or-fresh live LLM fundamental read for `symbol`, or None if
        the feature is disabled, unconfigured, or relevance-pruned. A cache hit costs no
        API call; a fresh call is persisted into the live track record as a pending
        prediction (see LLMTrackRecord) -- this is what accumulates real accuracy over
        time. Never used in backtesting -- see NOT_BACKTESTABLE_INDICATORS.
        """
        if not self.llm_enabled or not self.openrouter_client.is_configured:
            return None

        cluster = classify_market_cap_cluster(upair.market_cap_rank)
        if "llm_fundamental_analysis" in self.relevance_pruner.get_pruned_indicators("1h", cluster):
            return None

        cache_key = f"llm_fundamental:{symbol}"
        cached = self.llm_cache.get(cache_key)
        if cached is not None:
            return LLMFundamentalAssessment(**cached)

        market_data = CoinMarketData(
            id=upair.market_cap_source_id,
            symbol=upair.base_coin,
            name=upair.name or upair.base_coin,
            market_cap=upair.market_cap,
            market_cap_rank=upair.market_cap_rank,
            current_price=ticker.last_price,
        )
        assessment = self.openrouter_client.analyze_fundamentals(symbol, upair.base_coin, market_data)
        if assessment is None:
            return None

        self.llm_cache.set(cache_key, assessment.model_dump(), config.llm_fundamental_cache_ttl_seconds)
        self.llm_track_record.record_call(
            symbol=symbol,
            timeframe="1h",
            cluster=cluster,
            score=assessment.score,
            confidence=assessment.confidence,
            reasoning=assessment.reasoning,
            entry_price=ticker.last_price,
            called_at_ms=assessment.timestamp_ms,
        )
        return assessment

    def get_macro_snapshot(self) -> MacroSnapshot | None:
        """Returns a cached-or-fresh market-wide (not per-coin) macro data read -- Fed
        funds rate, 10Y Treasury yield, CPI YoY, aggregate DeFi TVL -- or None if the
        feature is disabled. Cache-backed (config.macro_data_cache_ttl_seconds, default 6h)
        so calling this from multiple places in the same cycle (run_scan_cycle once before
        its per-symbol loop, plus _reevaluate_and_act_on_position and
        _evaluate_news_triggered_entry) costs at most one real fetch per TTL window, not
        one per call site. Feeds sisera/indicators/macro.py's compute_macro_regime; never
        used in backtesting for the LLM/news half of this layer, but this data itself is
        real historical fact, not LLM judgment -- see the comment above
        NOT_BACKTESTABLE_INDICATORS in sisera/backtest/engine.py.
        """
        if not self.macro_enabled:
            return None

        cache_key = "macro_snapshot:latest"
        cached = self.macro_cache.get(cache_key)
        if cached is not None:
            return MacroSnapshot(**cached)

        fed_funds_rate = fed_funds_rate_1m_ago = None
        treasury_10y_yield = treasury_10y_yield_1m_ago = None
        cpi_yoy_pct = None

        if self.fred_client.is_configured:
            fed_obs = self.fred_client.get_recent_observations("FEDFUNDS", limit=3)  # monthly series
            if len(fed_obs) >= 1:
                fed_funds_rate = fed_obs[0][1]
            if len(fed_obs) >= 2:
                fed_funds_rate_1m_ago = fed_obs[1][1]

            yield_obs = self.fred_client.get_recent_observations("DGS10", limit=30)  # daily series
            if len(yield_obs) >= 1:
                treasury_10y_yield = yield_obs[0][1]
            if len(yield_obs) >= 22:
                treasury_10y_yield_1m_ago = yield_obs[21][1]  # ~1 trading month back

            cpi_obs = self.fred_client.get_recent_observations("CPIAUCSL", limit=13)  # monthly series
            if len(cpi_obs) >= 13 and cpi_obs[12][1]:
                cpi_yoy_pct = (cpi_obs[0][1] - cpi_obs[12][1]) / cpi_obs[12][1] * 100.0

        aggregate_tvl_usd = self.defillama_client.get_aggregate_tvl()
        aggregate_tvl_7d_ago_usd = self.defillama_client.get_historical_tvl(days_ago=7)

        snapshot = MacroSnapshot(
            fed_funds_rate=fed_funds_rate,
            fed_funds_rate_1m_ago=fed_funds_rate_1m_ago,
            treasury_10y_yield=treasury_10y_yield,
            treasury_10y_yield_1m_ago=treasury_10y_yield_1m_ago,
            cpi_yoy_pct=cpi_yoy_pct,
            aggregate_tvl_usd=aggregate_tvl_usd,
            aggregate_tvl_7d_ago_usd=aggregate_tvl_7d_ago_usd,
        )
        self.macro_cache.set(cache_key, snapshot.model_dump(), config.macro_data_cache_ttl_seconds)
        return snapshot

    def settle_llm_track_record(self) -> int:
        """Settles any live LLM fundamental calls whose resolve window has elapsed,
        against real current prices -- call once per scan cycle. Returns the number
        settled. No-ops when the feature is disabled."""
        if not self.llm_enabled:
            return 0

        def _price_lookup(symbol: str) -> float | None:
            try:
                return self.bybit_client.get_ticker(symbol).last_price
            except Exception:  # noqa: BLE001
                return None

        return self.llm_track_record.settle_due(price_lookup=_price_lookup)

    def settle_news_track_record(self) -> int:
        """Settles any live news_sentiment calls whose resolve window has elapsed, against
        real current prices, and updates the Event Attribution Engine's per-source
        reliability from the same settled rows (§5 -- see EventAttributionEngine). Call
        once per news monitor cycle. No-ops when the feature is disabled. This was missing
        entirely until now -- news_sentiment's real-world accuracy was never being fed back
        into relevance tracking (see tests/test_orchestrator.py regression test)."""
        if not self.news_enabled:
            return 0

        def _price_lookup(symbol: str) -> float | None:
            try:
                return self.bybit_client.get_ticker(symbol).last_price
            except Exception:  # noqa: BLE001
                return None

        settled = self.news_track_record.settle_due(price_lookup=_price_lookup)
        if hasattr(self, "event_attribution_engine"):
            self.event_attribution_engine.settle_due(price_lookup=_price_lookup)
        return settled

    def settle_decision_counterfactuals(self, hours: float = 4.0) -> int:
        """Settles ledger entries older than `hours` that don't yet have a
        counterfactual_verdict, against real current prices -- call once per scan cycle.
        DecisionLedger.update_counterfactual() has existed since the ledger was built but
        was never actually called anywhere, so counterfactual_verdict was always None on
        every real entry; this is what gives DriftDetectionEngine's calibration score
        (sisera/intelligence/drift_engine.py) real settled-outcome data to compute from,
        instead of reading nonexistent DecisionLedgerEntry attributes. Returns the number
        of entries settled this call."""
        cutoff_ms = int(time.time() * 1000) - int(hours * 3600 * 1000)
        settled = 0
        for entry in self.ledger.query(limit=200):
            if entry.counterfactual_verdict is not None or entry.timestamp_ms > cutoff_ms:
                continue
            entry_price = entry.opportunity_snapshot.get("entry_price")
            if not entry_price:
                continue
            current_price = self._safe_last_price(entry.symbol)
            if current_price is None:
                continue
            direction = entry.opportunity_snapshot.get("direction", "LONG")
            if direction == "LONG":
                return_pct = (current_price - entry_price) / entry_price * 100.0
            else:
                return_pct = (entry_price - current_price) / entry_price * 100.0
            self.ledger.update_counterfactual(entry.entry_id, return_4h=return_pct)
            settled += 1
        return settled

    def run_scan_cycle(
        self,
        timeframes: list[str] | None = None,
        max_scan_pairs: int | None = None,
    ) -> ScanCycleReport:
        """Executes one full scan and ranking cycle over the universe."""
        scan_start_ms = int(time.time() * 1000)
        tfs = timeframes or ["1h", "4h"]
        if not self.current_universe:
            self.refresh_universe()

        pairs_to_scan = (
            self.current_universe[:max_scan_pairs] if max_scan_pairs else self.current_universe
        )

        # Settle any due LLM fundamental calls and decision counterfactuals against real
        # prices before scoring this cycle -- a learning/bookkeeping step, independent of
        # circuit-breaker state.
        self.settle_llm_track_record()
        self.settle_decision_counterfactuals()

        # 1. Check Circuit Breakers
        passed_breakers, breaker_reasons = self.risk_manager.check_circuit_breakers(self.portfolio)
        if not passed_breakers:
            logger.warning("Circuit breakers active: %s", breaker_reasons)
            self.alert_manager.send_alert(
                AlertType.CIRCUIT_BREAKER_TRIPPED,
                "Circuit Breaker Active",
                f"Scan cycle skipped new entries due to: {', '.join(breaker_reasons)}",
            )
            return ScanCycleReport(
                timestamp_ms=scan_start_ms,
                scanned_pairs_count=len(pairs_to_scan),
                ranked_candidates_count=0,
                trades_executed_count=0,
                waits_count=0,
                no_trades_count=0,
                top_candidates=[],
                circuit_breakers_tripped=breaker_reasons,
            )

        # 2. Score across pairs and timeframes
        scores_by_pair: dict[str, dict[str, PairScore]] = {}
        tickers_by_pair: dict[str, Ticker] = {}
        books_by_pair: dict[str, OrderBook] = {}

        # Market-wide, not per-symbol -- fetched once here and reused for every symbol's
        # MarketSnapshot this cycle, rather than once per symbol (see get_macro_snapshot).
        macro_snap = self.get_macro_snapshot()

        for upair in pairs_to_scan:
            symbol = upair.symbol
            scores_by_pair[symbol] = {}

            try:
                ticker = self.bybit_client.get_ticker(symbol)
                tickers_by_pair[symbol] = ticker
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to fetch ticker for %s: %s", symbol, exc)
                continue

            try:
                book = self.bybit_client.get_orderbook(symbol, depth=10)
                books_by_pair[symbol] = book
            except Exception:  # noqa: BLE001
                book = None

            llm_assessment = self._get_llm_fundamental(symbol, upair, ticker)

            for tf in tfs:
                try:
                    ohlcv = self.bybit_client.get_klines(symbol, timeframe=tf, limit=80)
                    snap = MarketSnapshot(
                        symbol=symbol,
                        timeframe=tf,
                        ohlcv=ohlcv,
                        ticker=ticker,
                        order_book=book,
                        llm_fundamental=llm_assessment,
                        macro_snapshot=macro_snap,
                    )
                    engine_out = self.indicator_engine.compute_snapshot(snap)
                    pair_score = self.scoring_engine.score(
                        symbol=symbol,
                        timeframe=tf,
                        engine_output=engine_out,
                        universe_pair=upair,
                        ticker=ticker,
                        order_book=book,
                    )
                    scores_by_pair[symbol][tf] = pair_score
                except Exception as exc:  # noqa: BLE001
                    logger.warning("Scoring failed for %s %s: %s", symbol, tf, exc)

        # 3. Rank Candidates
        ranked_candidates = self.ranking_engine.rank(scores_by_pair, primary_timeframe="1h")
        logger.info("Ranking complete: %d qualified candidates", len(ranked_candidates))

        trades_count = 0
        waits_count = 0
        no_trades_count = 0

        # Real current book EV (sum of currently-tracked open positions' entry-thesis
        # EV) and real settled-trade R-multiples by timeframe -- computed once per cycle,
        # not per-candidate. Previously OpportunityEngine.package() always defaulted
        # current_book_ev_r to a hardcoded 1.42 literal since no caller anywhere passed a
        # real value; pre_trade_book_ev_r/post_trade_book_ev_r/avg_win_r/avg_loss_r were
        # fabricated as a direct consequence.
        current_book_ev = round(sum(o.ev_r for o in self.active_opportunities.values()), 2)
        trade_r_multiples_by_tf: dict[str, list[float]] = {}
        for attr in self.recent_trade_attributions:
            trade_r_multiples_by_tf.setdefault(attr.get("timeframe", ""), []).append(
                attr.get("pnl_r_multiple", 0.0)
            )

        # 4. Package Opportunities & Decision Policy
        for cand in ranked_candidates:
            symbol = cand.symbol
            ticker = tickers_by_pair.get(symbol)
            book = books_by_pair.get(symbol)
            if not ticker:
                continue

            opp = self.opportunity_engine.package(
                cand, ticker, book,
                current_book_ev_r=current_book_ev,
                recent_trade_r_multiples_by_timeframe=trade_r_multiples_by_tf,
            )

            # Small-account tier: this is the hierarchical 4H/1H/15M asymmetric strategy
            # actually designed for <=$250 accounts (see sisera/strategy/convex_growth.py).
            # It previously sat instantiated but unused -- every live decision went through
            # the generic ATR-based thesis regardless of account size. Prefer its signal when
            # both 4H and 1H reads are available; otherwise stay out rather than silently
            # falling back to a thesis this strategy tier wasn't designed around.
            if self.portfolio.equity <= 250.0:
                scores_4h = cand.timeframe_scores.get("4h")
                scores_1h = cand.timeframe_scores.get("1h")
                if not scores_4h or not scores_1h:
                    no_trades_count += 1
                    continue

                signal = self.convex_strategy.evaluate_candidate(
                    symbol=symbol,
                    scores_by_tf=cand.timeframe_scores,
                    ticker=ticker,
                    order_book=book,
                    btc_stability=scores_4h.regime_state.stability_score,
                    account_equity=self.portfolio.equity,
                )
                if signal is None:
                    ledger_entry = DecisionLedgerEntry(
                        entry_id=f"dec_{symbol}_{scan_start_ms}",
                        symbol=symbol,
                        timeframe="15m",
                        decision=DecisionType.NO_TRADE.value,
                        reason_codes=["NO_CONVEX_SETUP"],
                        opportunity_snapshot=opp.model_dump(),
                        plain_language_rationale=(
                            f"NO_TRADE for {symbol}: no qualifying Convex Growth asymmetric "
                            f"setup (4H regime / 1H confirmation / 15M entry did not align)."
                        ),
                    )
                    self.ledger.record(ledger_entry)
                    no_trades_count += 1
                    continue

                opp.direction = signal.direction
                opp.expected_value = signal.calibrated_ev_r
                opp.ev_r = signal.calibrated_ev_r
                opp.p_win = signal.calibrated_p_win
                stop_dist = ticker.last_price * signal.stop_distance_pct
                opp.invalidation_price = (
                    ticker.last_price - stop_dist
                    if signal.direction == TradeDirection.LONG
                    else ticker.last_price + stop_dist
                )

            dec_result = self.decision_policy.decide(opp)

            opp_snap = opp.model_dump()
            opp_snap["recommended_size_pct"] = dec_result.recommended_size_pct
            opp_snap["execution_tier"] = dec_result.execution_tier

            # Record in Decision Ledger (§1)
            ledger_entry = DecisionLedgerEntry(
                entry_id=f"dec_{symbol}_{scan_start_ms}",
                symbol=symbol,
                timeframe=cand.primary_timeframe,
                decision=dec_result.decision.value,
                reason_codes=dec_result.reason_codes,
                opportunity_snapshot=opp_snap,
                plain_language_rationale=dec_result.rationale,
            )
            self.ledger.record(ledger_entry)

            if dec_result.decision in (DecisionType.TRADE, DecisionType.PROBE):
                opened = self._execute_trade_if_approved(symbol, opp, dec_result, ticker, book)
                if opened:
                    trades_count += 1
                else:
                    no_trades_count += 1
            elif dec_result.decision == DecisionType.WAIT:
                waits_count += 1
            else:
                no_trades_count += 1

        return ScanCycleReport(
            timestamp_ms=scan_start_ms,
            scanned_pairs_count=len(pairs_to_scan),
            ranked_candidates_count=len(ranked_candidates),
            trades_executed_count=trades_count,
            waits_count=waits_count,
            no_trades_count=no_trades_count,
            top_candidates=ranked_candidates[:5],
            circuit_breakers_tripped=[],
        )

    def _execute_trade_if_approved(
        self, symbol: str, opp: Opportunity, dec_result, ticker: Ticker, book: OrderBook | None
    ) -> bool:
        """Sizing, pre-trade risk checks, and order execution for one already-decided
        TRADE/PROBE opportunity -- shared by the normal scan cycle and
        _evaluate_news_triggered_entry, so a news-driven entry goes through exactly the
        same risk management as a normally-scheduled one, just triggered sooner. Returns
        whether a position was actually opened."""
        # Real market-cap-tier clustering (large_cap/mid_cap/small_cap by actual rank),
        # not a crude "large_cap" iff BTC/ETH else "mid_cap" split. That split lumped
        # EVERY non-BTC/ETH asset into one bucket sharing one
        # max_correlation_cluster_exposure budget -- confirmed live: a single $37 LINK
        # position at 37.6% of a $100 account was already saturating the entire 40% cap
        # for every other altcoin candidate, since they were all classified the same
        # "mid_cap" as LINK regardless of actual size/liquidity tier. BTC/ETH still land
        # in large_cap under this scheme too (real rank 1-2, well within the rank<=20
        # large_cap threshold), so no special-case is needed for them anymore.
        upair = next((p for p in self.current_universe if p.symbol == symbol), None)
        cluster = classify_market_cap_cluster(upair.market_cap_rank if upair else None)
        sizing = self.risk_manager.size_position(
            opp, self.portfolio, cluster=cluster, size_multiplier=dec_result.recommended_size_pct
        )

        limits_ok, _ = self.risk_manager.check_factor_and_correlation_limits(
            opp, sizing, self.portfolio, cluster=cluster
        )
        stress_res = self.risk_manager.stress_test_portfolio(opp, sizing, self.portfolio)
        min_notional = 5.0 if dec_result.decision == DecisionType.PROBE else 10.0

        if not (
            sizing.passed_liquidation_stress_check
            and sizing.notional_size >= min_notional
            and limits_ok
            and stress_res.passed
            and symbol not in self.portfolio.open_positions
        ):
            return False

        qty = sizing.notional_size / ticker.last_price
        order_req = OrderRequest(
            symbol=symbol,
            direction=opp.direction,
            order_type="Limit",
            qty=qty,
            price=ticker.last_price,
            stop_loss=sizing.initial_stop_price,
        )
        responses = self.exec_intelligence.execute_with_fallback(order_req, opp, book)
        if not any(r.status == "Filled" for r in responses):
            return False

        new_pos = Position(
            symbol=symbol,
            direction=opp.direction,
            entry_price=ticker.last_price,
            size_notional=sizing.notional_size,
            leverage=sizing.leverage,
            margin=sizing.margin_required,
            liquidation_price=sizing.liquidation_price,
            stop_loss_price=sizing.initial_stop_price,
            highest_price=ticker.last_price,
            lowest_price=ticker.last_price,
            opportunity_id=opp.opportunity_id,
            cluster=cluster,
            entry_open_interest=ticker.open_interest,
        )
        self.portfolio.open_positions[symbol] = new_pos
        self.active_opportunities[symbol] = opp
        self.portfolio.daily_trades_count += 1

        self.alert_manager.send_alert(
            AlertType.TRADE_OPENED,
            f"Opened {opp.direction.value} on {symbol}",
            f"Size: ${sizing.notional_size:.2f} ({sizing.leverage:.1f}x) @ {ticker.last_price:.4f}",
            {"opportunity_id": opp.opportunity_id, "ev": opp.expected_value},
        )
        return True

    def run_fast_position_monitor(self) -> None:
        """Fast sub-loop (5 min) for open-position monitoring & Position Intelligence (§4, §12)."""
        for symbol, pos in list(self.portfolio.open_positions.items()):
            self._reevaluate_and_act_on_position(symbol, pos)

    def _reevaluate_and_act_on_position(
        self, symbol: str, pos: Position, news: NewsAssessment | None = None
    ) -> None:
        """Fetches fresh market data, re-evaluates one open position via Position
        Intelligence, and applies the resulting HOLD/EXIT/TIGHTEN_STOP/REDUCE action.
        Shared by the normal 5-minute position monitor (news=None) and
        _react_to_news_on_position (news=<assessment>, called immediately on a significant
        breaking-news match rather than waiting for the next scheduled tick) -- both paths
        go through the exact same risk-managed evaluation and order-placement logic."""
        try:
            ticker = self.bybit_client.get_ticker(symbol)
            book = self.bybit_client.get_orderbook(symbol, depth=5)
            ohlcv = self.bybit_client.get_klines(symbol, timeframe="1h", limit=50)
        except Exception as exc:  # noqa: BLE001
            logger.warning("Position monitor fetch failed for %s: %s", symbol, exc)
            return

        current_price = ticker.last_price
        opp = self.active_opportunities.get(symbol) or Opportunity(
            opportunity_id="fallback",
            symbol=symbol,
            direction=pos.direction,
            primary_timeframe="1h",
            entry_price=pos.entry_price,
            invalidation_price=pos.stop_loss_price,
            invalidation_conditions=[],
            holding_horizon_bars=12,
            expected_value=0.05,
            p_win=0.6,
            epistemic_uncertainty=0.2,
        )

        # 1. Update Trailing Stop
        trailed_stop = self.risk_manager.calculate_trailing_stop(pos, current_price)
        if trailed_stop:
            pos.trailing_stop_price = trailed_stop

        # 2. Position Intelligence Re-evaluation (§12)
        snap = MarketSnapshot(
            symbol=symbol,
            timeframe="1h",
            ohlcv=ohlcv,
            ticker=ticker,
            order_book=book,
            macro_snapshot=self.get_macro_snapshot(),
        )
        engine_out = self.indicator_engine.compute_snapshot(snap)

        eval_res = self.position_intelligence.reevaluate(
            position=pos,
            opportunity=opp,
            ticker=ticker,
            regime_state=engine_out.regime_state,
            order_book=book,
            portfolio=self.portfolio,
            news=news,
            news_min_urgency=config.news_min_urgency_for_action,
        )

        if eval_res.action == PositionAction.EXIT:
            # Close Position
            exit_dir = (
                TradeDirection.SHORT if pos.direction == TradeDirection.LONG else TradeDirection.LONG
            )
            exit_req = OrderRequest(
                symbol=symbol,
                direction=exit_dir,
                order_type="Market",
                qty=pos.size_notional / current_price,
            )
            self.execution_adapter.place_order(exit_req)
            self.record_trade_attribution(symbol, pos, opp, current_price)
            del self.portfolio.open_positions[symbol]
            self.active_opportunities.pop(symbol, None)

            self.alert_manager.send_alert(
                AlertType.TRADE_CLOSED,
                f"Closed {pos.direction.value} on {symbol}",
                f"Reason: {eval_res.rationale} @ price {current_price:.4f}",
            )
        elif eval_res.action == PositionAction.TIGHTEN_STOP and eval_res.suggested_stop_price:
            pos.trailing_stop_price = eval_res.suggested_stop_price
            logger.info("Tightened stop for %s to %.4f", symbol, eval_res.suggested_stop_price)
        elif eval_res.action == PositionAction.REDUCE:
            rem_factor = 1.0 - eval_res.size_adjustment_factor
            reduce_qty = (pos.size_notional * rem_factor) / current_price
            reduce_dir = (
                TradeDirection.SHORT if pos.direction == TradeDirection.LONG else TradeDirection.LONG
            )
            reduce_req = OrderRequest(
                symbol=symbol,
                direction=reduce_dir,
                order_type="Market",
                qty=reduce_qty,
            )
            self.execution_adapter.place_order(reduce_req)
            pos.size_notional *= eval_res.size_adjustment_factor
            pos.margin *= eval_res.size_adjustment_factor
            pct_label = rem_factor * 100
            logger.info("Reduced position %s by %.0f%%", symbol, pct_label)

    def record_trade_attribution(
        self, symbol: str, pos: Position, opp: Opportunity, exit_price: float
    ) -> None:
        """Decomposes this closed trade's P&L via TradeAttributionEngine and records it
        into recent_trade_attributions for the dashboard (/api/attribution). Wrapped in
        try/except so a failure here can never block the actual position close -- this is
        bookkeeping, not risk-critical. TradeAttributionEngine.attribute_trade() already
        existed but was never called anywhere before this."""
        try:
            attribution = self.attribution_engine.attribute_trade(
                trade_id=f"{symbol}_{int(time.time() * 1000)}",
                position=pos,
                opportunity=opp,
                exit_price=exit_price,
            )
            self.recent_trade_attributions.append(attribution.model_dump())
            self.recent_trade_attributions = self.recent_trade_attributions[-50:]
        except Exception as exc:  # noqa: BLE001
            logger.warning("Trade attribution failed for %s: %s", symbol, exc)

    def run_news_monitor_cycle(self) -> int:
        """Fast news-monitoring cycle (RSS + Telegram, §1, §5): fetches new headlines,
        matches them against the current universe and open positions (cheap, free, no LLM
        call), and only for genuine matches runs a cheap targeted LLM significance check.
        Significant, urgent news triggers an expedited reaction immediately -- exit/reduce
        for an existing position via _react_to_news_on_position, or a risk-managed
        new-entry evaluation for a watchlist symbol via _evaluate_news_triggered_entry --
        rather than waiting for the next normal scan cycle. Meant to be called on a short
        interval (config.news_monitor_interval_seconds, default 180s), separate from the
        15-minute main scan and 5-minute position monitor. Returns the number of
        significant (urgency >= config.news_min_urgency_for_action) events processed.
        No-ops (returns 0) when the feature is disabled.
        """
        if not self.news_enabled or not self.openrouter_client.is_configured:
            return 0

        # Settle any due calls against real prices before processing new items -- a
        # learning/bookkeeping step, same position settle_llm_track_record() occupies at
        # the top of run_scan_cycle().
        self.settle_news_track_record()

        since_ms = int(time.time() * 1000) - config.news_monitor_interval_seconds * 1000 * 4
        try:
            rss_items = self.news_feed_client.fetch_latest()
        except Exception as exc:  # noqa: BLE001
            logger.warning("News feed fetch failed: %s", exc)
            rss_items = []
        telegram_items = self.telegram_news_monitor.fetch_recent_messages(since_ms=since_ms)
        x_items = (
            self.x_client.fetch_recent_posts(config.x_tracked_accounts) if self.x_enabled else []
        )

        unseen = self.seen_news_store.filter_unseen(rss_items + telegram_items + x_items)
        if not unseen:
            return 0

        # Tracked pool = current universe (this is what makes low-caps reachable, not just
        # symbols already held) plus any open position outside it (shouldn't normally
        # happen, but a position shouldn't silently stop being news-monitored if it does).
        # Prefer the full display name (e.g. "Bitcoin") over the bare ticker where
        # available -- build_alias_map derives the ticker from the symbol either way, so
        # this only adds the name as an extra match term, it doesn't lose ticker matching.
        tracked_names = {p.symbol: (p.name or p.base_coin) for p in self.current_universe}
        for held_symbol in self.portfolio.open_positions:
            tracked_names.setdefault(held_symbol, held_symbol.removesuffix("USDT"))
        alias_map = build_alias_map(tracked_names)

        significant_count = 0
        for item in unseen:
            for symbol in match_symbols(item, alias_map):
                entry_price = self._safe_last_price(symbol) or 0.0
                extra_context = self._build_news_extra_context(item, symbol)
                assessment = self.openrouter_client.assess_news_headline(
                    symbol,
                    tracked_names.get(symbol, symbol.removesuffix("USDT")),
                    item,
                    extra_context=extra_context,
                )
                if assessment is None:
                    continue

                cluster = classify_market_cap_cluster(
                    next(
                        (p.market_cap_rank for p in self.current_universe if p.symbol == symbol),
                        None,
                    )
                )
                self.news_track_record.record_call(
                    symbol=symbol,
                    timeframe="1h",
                    cluster=cluster,
                    score=assessment.score,
                    confidence=assessment.confidence,
                    reasoning=assessment.reasoning,
                    entry_price=entry_price,
                    called_at_ms=assessment.timestamp_ms,
                )
                self.event_attribution_engine.record_call(
                    source_type=item.source_type,
                    source_name=item.source_name,
                    symbol=symbol,
                    event_category=assessment.event_category,
                    severity=assessment.severity,
                    score=assessment.score,
                    confidence=assessment.confidence,
                    entry_price=entry_price,
                    called_at_ms=assessment.timestamp_ms,
                )

                self.recent_news_events.append(
                    {
                        "symbol": symbol,
                        "source_type": item.source_type,
                        "source_name": item.source_name,
                        "title": item.title,
                        "event_category": assessment.event_category,
                        "severity": assessment.severity,
                        "score": assessment.score,
                        "urgency": assessment.urgency,
                        "confidence": assessment.confidence,
                        "reasoning": assessment.reasoning,
                        "timestamp_ms": assessment.timestamp_ms,
                    }
                )
                self.recent_news_events = self.recent_news_events[-50:]

                if assessment.severity >= config.news_high_severity_alert_threshold:
                    self.alert_manager.send_alert(
                        AlertType.HIGH_SEVERITY_EVENT,
                        f"S{assessment.severity} event: {symbol} ({assessment.event_category})",
                        f"[{item.source_name}] {item.title}\n{assessment.reasoning}",
                        {
                            "severity": assessment.severity, "event_category": assessment.event_category,
                            "source": item.source_name,
                        },
                    )

                if assessment.urgency < config.news_min_urgency_for_action:
                    continue
                significant_count += 1

                self.alert_manager.send_alert(
                    AlertType.BREAKING_NEWS,
                    f"Breaking news: {symbol}",
                    f"[{item.source_name}] {item.title}\n{assessment.reasoning}",
                    {
                        "score": assessment.score, "urgency": assessment.urgency,
                        "confidence": assessment.confidence, "source": item.source_name,
                    },
                )

                if symbol in self.portfolio.open_positions:
                    self._reevaluate_and_act_on_position(
                        symbol, self.portfolio.open_positions[symbol], news=assessment
                    )
                else:
                    self._evaluate_news_triggered_entry(symbol, assessment)

        return significant_count

    def _safe_last_price(self, symbol: str) -> float | None:
        try:
            return self.bybit_client.get_ticker(symbol).last_price
        except Exception:  # noqa: BLE001
            return None

    def _build_news_extra_context(self, item: NewsItem, symbol: str) -> str | None:
        """Builds the "Context:" string passed into assess_news_headline's extra_context --
        this source's empirical track record (Event Attribution Engine, §5) plus how many
        distinct sources have reported matching content on this symbol recently
        (CorroborationTracker, §6). Both are real, computed numbers, not hints -- the
        system prompt instructs the model to treat this section as verified data."""
        reliability_summary = self.event_attribution_engine.get_reliability_summary(
            item.source_type, item.source_name
        )
        corroboration_count, corroborating_sources = self.corroboration_tracker.record_and_count(
            item, symbol
        )
        corroboration_summary = (
            f"{corroboration_count} distinct source(s) reported matching content on this "
            f"symbol in the last {int(config.news_corroboration_window_seconds // 60)} "
            f"minutes: {', '.join(corroborating_sources)}"
        )
        return f"{reliability_summary}. {corroboration_summary}."

    def _evaluate_news_triggered_entry(self, symbol: str, assessment: NewsAssessment) -> None:
        """Risk-managed evaluation of a possible new position triggered by significant
        breaking news on a symbol with no existing position -- e.g. the user's own example
        of shorting on a founder-resignation report. Reuses the exact same
        scoring -> ranking -> opportunity -> decision -> sizing pipeline as the normal scan
        cycle (via _execute_trade_if_approved), just evaluated immediately for one symbol
        instead of waiting for the next scheduled cycle, and with the packaged
        Opportunity's thesis overridden by the news read (direction, EV, p_win) the same
        way a ConvexGrowthStrategy signal overrides the generic thesis in the backtest
        engine -- but still gated by the normal decision policy and risk manager, never
        bypassing them. A low-confidence or low-EV news read still won't clear the trade
        threshold; that's the point of routing through the same gates as everything else.
        """
        try:
            ticker = self.bybit_client.get_ticker(symbol)
            book = self.bybit_client.get_orderbook(symbol, depth=10)
            ohlcv = self.bybit_client.get_klines(symbol, timeframe="1h", limit=80)
        except Exception as exc:  # noqa: BLE001
            logger.warning("News-triggered entry fetch failed for %s: %s", symbol, exc)
            return

        upair = next((p for p in self.current_universe if p.symbol == symbol), None)
        snap = MarketSnapshot(
            symbol=symbol, timeframe="1h", ohlcv=ohlcv, ticker=ticker, order_book=book,
            news_assessment=assessment, macro_snapshot=self.get_macro_snapshot(),
        )
        engine_out = self.indicator_engine.compute_snapshot(snap)
        score = self.scoring_engine.score(
            symbol=symbol, timeframe="1h", engine_output=engine_out,
            universe_pair=upair, ticker=ticker, order_book=book,
        )
        ranked = self.ranking_engine.rank({symbol: {"1h": score}}, primary_timeframe="1h")
        if not ranked:
            return

        current_book_ev = round(sum(o.ev_r for o in self.active_opportunities.values()), 2)
        opp = self.opportunity_engine.package(ranked[0], ticker, book, current_book_ev_r=current_book_ev)

        # Override the generic thesis with the news read (direction, magnitude, confidence)
        directional_strength = abs(assessment.score) * assessment.confidence
        opp.direction = TradeDirection.LONG if assessment.score >= 0 else TradeDirection.SHORT
        opp.p_win = min(0.9, 0.5 + directional_strength * 0.4)
        news_ev_r = round(directional_strength * 1.5, 2)
        opp.expected_value = news_ev_r
        opp.ev_r = news_ev_r
        stop_dist = ticker.last_price * 0.025  # fixed 2.5% -- fast, event-driven move
        opp.invalidation_price = (
            ticker.last_price - stop_dist
            if opp.direction == TradeDirection.LONG
            else ticker.last_price + stop_dist
        )

        dec_result = self.decision_policy.decide(opp)
        ledger_entry = DecisionLedgerEntry(
            entry_id=f"news_dec_{symbol}_{assessment.timestamp_ms}",
            symbol=symbol,
            timeframe="1h",
            decision=dec_result.decision.value,
            reason_codes=dec_result.reason_codes,
            opportunity_snapshot=opp.model_dump(),
            plain_language_rationale=dec_result.rationale,
        )
        self.ledger.record(ledger_entry)

        if dec_result.decision in (DecisionType.TRADE, DecisionType.PROBE):
            self._execute_trade_if_approved(symbol, opp, dec_result, ticker, book)
