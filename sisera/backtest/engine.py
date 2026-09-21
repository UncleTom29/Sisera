"""Backtesting Engine. See SCOPE.md §10.

Full pipeline replay:
- Data -> Multi-family Indicators -> Scoring & Calibration -> Opportunity Engine
  -> Decision Policy -> Risk Manager -> Execution.
- Realistic depth-based slippage and 8-hour Bybit funding accrual.
- ATR-based trailing stops mid-simulation.
- Multiple-comparisons discipline: Combinatorial Purged Cross-Validation (CPCV)
  and Deflated Sharpe Ratio (DSR).
- Independent per-timeframe profiling and gating check against EV, PF, DD, and DSR floors.
"""

from __future__ import annotations

import itertools
import logging
import math
from dataclasses import dataclass

import numpy as np
import pandas as pd

from sisera.backtest.attribution import TradeAttributionEngine
from sisera.backtest.models import BacktestTimeframeResult, CPCVResult
from sisera.data.bybit import BybitClient
from sisera.data.deribit import DeribitClient
from sisera.data.models import OrderBook, OrderBookLevel, Ticker
from sisera.indicators.engine import IndicatorEngine, MarketSnapshot
from sisera.ledger.ledger import DecisionLedger
from sisera.ledger.models import DecisionLedgerEntry
from sisera.opportunity.engine import OpportunityEngine
from sisera.opportunity.models import DecisionType, TradeDirection
from sisera.opportunity.policy import DecisionPolicy
from sisera.risk.manager import RiskManager
from sisera.risk.models import PortfolioState, Position
from sisera.scoring.profiles import TimeframeStrategyProfile, default_timeframe_profiles
from sisera.scoring.ranking import RankingEngine
from sisera.scoring.relevance import IndicatorRelevancePruner
from sisera.scoring.scorer import ScoringEngine
from sisera.strategy.convex_growth import ConvexGrowthStrategy

logger = logging.getLogger(__name__)

# Indicators that need data with no free historical source, so they can never be
# meaningfully backtested regardless of how much OHLCV/funding/OI/DVOL history is loaded:
# - order_book_imbalance needs historical L2 book depth; Bybit only exposes a *live*
#   snapshot, not a replay (you'd need to have recorded your own WebSocket feed over time).
# - liquidation_cascade needs historical individual liquidation events; same problem --
#   Bybit's `allLiquidation` feed is WebSocket-only, no historical REST endpoint.
# - cross_venue_funding_divergence needs a second exchange's historical funding rate,
#   which is a separate data-pipeline scope not built here.
# - put_call_skew needs a historical options *chain* (many simultaneous strikes/expiries'
#   mark IV over time), not a single index value -- Deribit's public API exposes historical
#   DVOL (a single aggregate index, see DeribitHistory) but not a historical order book or
#   chain snapshot per expired contract, so there's no free way to reconstruct a continuous
#   25-delta skew series. implied_volatility (DVOL-based) is NOT in this set -- see
#   DeribitHistory/fetch_dvol_history, which does give it a real historical baseline.
# - llm_fundamental_analysis and news_sentiment are excluded for a different reason than
#   the other four: it's not a data-availability gap, it's that an LLM asked "what were
#   this coin's fundamentals/this headline's significance as of date X" cannot be trusted
#   not to have been influenced by what it knows happened after date X -- there's no way to
#   guarantee a clean historical judgment the way a real historical price/funding-rate
#   series can be. Their real accuracy is instead tracked forward over time as live calls
#   settle -- see sisera/scoring/llm_track_record.py -- and fed into the same
#   IndicatorRelevancePruner every other indicator earns trust through. news_sentiment adds
#   a second, independent reason: "backtesting" it would mean replaying old news headlines
#   against a model that may already know how the story ended, which is an even more direct
#   form of the same look-ahead contamination.
# All six stay fully active in *live* trading (Orchestrator has real-time access to all of
# them, or in the LLM indicators' case, a live model call); this exclusion is specific to
# historical replay. Backtesting the first four against constant placeholder values doesn't
# measure "this indicator has no edge" -- it measures nothing, since the input never
# varies. Better to exclude them honestly than let them silently read as zero relevance (or,
# for the LLM indicators, a fabricated one).
# macro_regime (sisera/indicators/macro.py) is deliberately NOT in this set, even though it
# ships alongside llm_fundamental_analysis/news_sentiment as part of the same
# event-intelligence layer and is live-only for now. It doesn't have their problem: its
# inputs (Fed funds rate, Treasury yields, CPI, aggregate DeFi TVL from FRED/Treasury/
# DeFiLlama) are honest historical facts, not an LLM's retrospective judgment -- "what was
# the 10Y yield on 2024-03-01" carries no look-ahead-contamination risk the way "was this
# coin's team credible as of 2024-03-01, according to a model trained after that date" does.
# It's absent from backtesting only because a MacroHistory loader hasn't been built yet
# (v1 ships it live-only), not because it belongs in this frozenset -- don't add it here by
# pattern-matching "new live-only indicator -> add to NOT_BACKTESTABLE_INDICATORS".
NOT_BACKTESTABLE_INDICATORS = frozenset(
    {
        "order_book_imbalance",
        "liquidation_cascade",
        "cross_venue_funding_divergence",
        "put_call_skew",
        "llm_fundamental_analysis",
        "news_sentiment",
    }
)


@dataclass
class DerivativesHistory:
    """Real historical funding rate / mark price / index price / open interest for one
    symbol, for point-in-time ("as of this bar's timestamp") alignment against OHLCV bars
    in backtests. Build via fetch_derivatives_history(), then register with
    BacktestEngine.load_derivatives_history() before calling run_timeframe_backtest /
    run_cpcv_backtest / run_convex_growth_backtest.

    Without this, funding_rate/basis/mark_index_divergence/open_interest_trend all read
    from a synthetic ticker with a flat funding rate and mark_price == index_price always
    -- meaning those indicators compute as exactly zero on every single backtest bar,
    regardless of what really happened historically. See NOT_BACKTESTABLE_INDICATORS for
    the (smaller) set of indicators this still can't fix, for lack of any free historical
    source at all.

    Each series is indexed by its own native timestamp/cadence -- funding settles 3x/day,
    OI/mark/index are typically hourly -- `.asof()` handles the misaligned cadences by
    design (most recent known value at or before the query timestamp).
    """

    funding_rate: pd.Series
    mark_price: pd.Series
    index_price: pd.Series
    open_interest: pd.Series

    def ticker_fields_as_of(
        self, ts: pd.Timestamp, fallback_price: float
    ) -> tuple[float, float, float, float]:
        """Returns (funding_rate, mark_price, index_price, open_interest) as of `ts`,
        falling back to neutral defaults for any series with no data at or before `ts`
        (e.g. before that series' history starts, or the series is empty)."""
        fr = self.funding_rate.asof(ts) if len(self.funding_rate) else None
        mp = self.mark_price.asof(ts) if len(self.mark_price) else None
        ip = self.index_price.asof(ts) if len(self.index_price) else None
        oi = self.open_interest.asof(ts) if len(self.open_interest) else None
        return (
            float(fr) if pd.notna(fr) else 0.0001,
            float(mp) if pd.notna(mp) else fallback_price,
            float(ip) if pd.notna(ip) else fallback_price,
            float(oi) if pd.notna(oi) else 10000.0,
        )

    def oi_window_as_of(self, ts: pd.Timestamp, lookback: int = 20) -> pd.DataFrame | None:
        """A trailing OI window ending at `ts`, shaped for compute_open_interest_trend()."""
        if not len(self.open_interest):
            return None
        window = self.open_interest.loc[:ts].tail(lookback)
        if len(window) < 2:
            return None
        return window.to_frame(name="open_interest")


def fetch_derivatives_history(
    client: BybitClient,
    symbol: str,
    timeframe: str = "1h",
    total_records: int = 3000,
    end_ms: int | None = None,
) -> DerivativesHistory:
    """Fetches and assembles real historical funding rate / mark price / index price /
    open interest for `symbol` via BybitClient's paginated endpoints. A single convenience
    call wrapping four separate fetches -- see DerivativesHistory.

    Note: OI history is capped by Bybit's public retention window (~4 months observed in
    practice as of 2026-08), well short of funding rate's multi-year history -- passing a
    `total_records`/`end_ms` combination that reaches further back than OI actually goes
    just means `open_interest_trend` silently has less history to work with than the other
    three indicators; it's a real data-availability ceiling, not a bug here.
    """
    funding = client.get_funding_rate_history_extended(
        symbol, total_records=total_records, end_ms=end_ms
    )
    mark = client.get_mark_price_klines_extended(
        symbol, timeframe, total_bars=total_records, end_ms=end_ms
    )
    index = client.get_index_price_klines_extended(
        symbol, timeframe, total_bars=total_records, end_ms=end_ms
    )
    oi = client.get_open_interest_history_extended(
        symbol, timeframe, total_records=total_records, end_ms=end_ms
    )
    return DerivativesHistory(
        funding_rate=funding["funding_rate"],
        mark_price=mark["close"],
        index_price=index["close"],
        open_interest=oi["open_interest"],
    )


def fetch_dvol_history(
    client: DeribitClient,
    currency: str,
    total_records: int = 4000,
    end_ms: int | None = None,
    max_requests: int = 20,
) -> pd.Series:
    """Fetches real historical DVOL (Deribit Volatility Index) for `currency` ("BTC" or
    "ETH" -- Deribit's only two options markets). Register with
    BacktestEngine.load_dvol_history() so `implied_volatility` scores against a real
    trailing baseline instead of the flat/neutral fallback (see NOT_BACKTESTABLE_INDICATORS
    for why `put_call_skew`, the other options indicator, can't get the same treatment).
    """
    df = client.get_volatility_index_history_extended(
        currency, total_records=total_records, end_ms=end_ms, max_requests=max_requests
    )
    return df["dvol"]


def calculate_deflated_sharpe_ratio(
    returns: np.ndarray,
    num_trials: int = 50,
    benchmark_sharpe: float = 0.0,
    annualization_factor: float = 365.0 * 24.0,
) -> float:
    """Calculates Bailey & López de Prado's Deflated Sharpe Ratio (DSR). See SCOPE.md §10.

    Discounts estimated Sharpe ratio by the expected maximum Sharpe under multiple trials.
    """
    n = len(returns)
    if n < 10 or float(np.std(returns)) < 1e-9:
        return 0.0

    mean_ret = float(np.mean(returns))
    std_ret = float(np.std(returns, ddof=1))
    sr = mean_ret / std_ret
    ann_sr = sr * math.sqrt(annualization_factor)

    # Skewness and Kurtosis of returns
    z = (returns - mean_ret) / std_ret
    skew = float(np.mean(z**3))
    kurt = float(np.mean(z**4))

    # Standard error of annualized Sharpe under null hypothesis
    se_sr = math.sqrt(annualization_factor / max(n - 1, 1))

    # Expected maximum Sharpe under null hypothesis across N independent trials
    euler_gamma = 0.5772156649
    log_n = math.log(max(num_trials, 2))
    z_n = (1.0 - euler_gamma) * math.sqrt(2.0 * log_n) + euler_gamma / math.sqrt(2.0 * log_n)
    expected_max_sr = benchmark_sharpe + se_sr * z_n

    # Variance of Sharpe estimate
    var_term = 1.0 - skew * sr + (kurt - 1.0) / 4.0 * (sr**2)
    se_actual = math.sqrt(max(1e-6, annualization_factor * var_term / max(n - 1, 1)))

    dsr_stat = (ann_sr - expected_max_sr) / se_actual
    dsr_prob = 0.5 * (1.0 + math.erf(dsr_stat / math.sqrt(2.0)))
    return float(np.clip(dsr_prob, 0.01, 0.99))


def calculate_cvar(returns: np.ndarray, alpha: float = 0.05) -> float:
    """Calculates Conditional Value at Risk (Expected Shortfall) at alpha (e.g. worst 5%)."""
    if len(returns) == 0:
        return 0.0
    cutoff = float(np.percentile(returns, alpha * 100))
    tail = returns[returns <= cutoff]
    return float(np.mean(tail)) if len(tail) > 0 else cutoff


class BacktestEngine:
    """Full-pipeline historical replay and validation engine. See SCOPE.md §10."""

    def __init__(
        self,
        indicator_engine: IndicatorEngine | None = None,
        scoring_engine: ScoringEngine | None = None,
        ranking_engine: RankingEngine | None = None,
        opportunity_engine: OpportunityEngine | None = None,
        decision_policy: DecisionPolicy | None = None,
        risk_manager: RiskManager | None = None,
        attribution_engine: TradeAttributionEngine | None = None,
        ledger: DecisionLedger | None = None,
        relevance_pruner: IndicatorRelevancePruner | None = None,
    ) -> None:
        self.indicator_engine = indicator_engine or IndicatorEngine()
        self.scoring_engine = scoring_engine or ScoringEngine()
        self.ranking_engine = ranking_engine or RankingEngine()
        self.opportunity_engine = opportunity_engine or OpportunityEngine()
        self.decision_policy = decision_policy or DecisionPolicy()
        self.risk_manager = risk_manager or RiskManager()
        self.attribution_engine = attribution_engine or TradeAttributionEngine()
        self.ledger = ledger or DecisionLedger(":memory:")
        self.relevance_pruner = relevance_pruner or IndicatorRelevancePruner()
        self.profiles = default_timeframe_profiles()
        self._derivatives_history: dict[str, DerivativesHistory] = {}
        self._dvol_history: dict[str, pd.Series] = {}

    def load_derivatives_history(self, symbol: str, history: DerivativesHistory) -> None:
        """Registers real historical funding/mark/index/OI data for `symbol` (see
        fetch_derivatives_history). Once loaded, every backtest method on this engine uses
        it instead of the constant synthetic placeholders that otherwise make
        funding_rate/basis/mark_index_divergence/open_interest_trend read as exactly zero
        relevance regardless of what really happened historically."""
        self._derivatives_history[symbol] = history

    def load_dvol_history(self, symbol: str, dvol: pd.Series) -> None:
        """Registers real historical DVOL for `symbol` ("BTCUSDT"/"ETHUSDT" -- keyed the
        same way as everywhere else in this engine, even though the underlying Deribit data
        is fetched by currency, not by the perpetual's symbol). See fetch_dvol_history."""
        self._dvol_history[symbol] = dvol

    def _dvol_fields(
        self, symbol: str, ts: pd.Timestamp, baseline_window: pd.Timedelta | None = None
    ) -> tuple[float | None, float | None]:
        """Returns (dvol, dvol_baseline) as-of `ts` -- baseline is the trailing mean over
        `baseline_window` (default 30 days), matching how ATR/Bollinger score "elevated vs.
        own recent history" elsewhere. (None, None) with no DVOL history registered for
        `symbol`."""
        series = self._dvol_history.get(symbol)
        if series is None or not len(series):
            return None, None
        dvol = series.asof(ts)
        if pd.isna(dvol):
            return None, None
        window = series.loc[ts - (baseline_window or pd.Timedelta(days=30)) : ts]
        baseline = float(window.mean()) if len(window) else None
        return float(dvol), baseline

    def _synthetic_ticker_and_book(
        self,
        symbol: str,
        price: float,
        notional_depth_usd: float = 200_000.0,
        timestamp: pd.Timestamp | None = None,
    ) -> tuple[Ticker, OrderBook]:
        """Builds a ticker + order book for one backtest bar. Order book depth is always
        synthetic (no free historical source -- see NOT_BACKTESTABLE_INDICATORS) and sized
        in notional (dollar) terms rather than a fixed base-asset unit size -- a fixed unit
        size (e.g. 20.0 units) is ~$1.26M of BTC but only ~$1.5k of a $75 altcoin, which
        silently starves low-price symbols of any liquidity score and makes them fail
        execution-quality gating on every bar.

        Ticker fields (funding rate, mark/index price, open interest) use real historical
        values as-of `timestamp` when load_derivatives_history() has registered history for
        `symbol`; otherwise they fall back to neutral constants (flat funding, mark==index).
        """
        hist = self._derivatives_history.get(symbol) if timestamp is not None else None
        if hist is not None:
            funding_rate, mark_price, index_price, open_interest = hist.ticker_fields_as_of(
                timestamp, price
            )
        else:
            funding_rate, mark_price, index_price, open_interest = 0.0001, price, price, 10000.0

        level_size = notional_depth_usd / max(price, 1e-9)
        ticker = Ticker(
            symbol=symbol,
            last_price=price,
            mark_price=mark_price,
            index_price=index_price,
            funding_rate=funding_rate,
            open_interest=open_interest,
            bid_price=price * 0.9998,
            ask_price=price * 1.0002,
        )
        book = OrderBook(
            symbol=symbol,
            bids=[OrderBookLevel(price=price * 0.9995, size=level_size)],
            asks=[OrderBookLevel(price=price * 1.0005, size=level_size)],
            timestamp_ms=1000,
        )
        return ticker, book

    def _oi_window(self, symbol: str, ts: pd.Timestamp) -> pd.DataFrame | None:
        """Trailing real OI window ending at `ts`, or None with no history registered for
        `symbol` -- see DerivativesHistory.oi_window_as_of."""
        hist = self._derivatives_history.get(symbol)
        return hist.oi_window_as_of(ts) if hist is not None else None

    def _funding_rate_as_of(self, symbol: str, ts: pd.Timestamp, price: float) -> float:
        """Real historical funding rate as-of `ts` when registered, else a flat fallback."""
        hist = self._derivatives_history.get(symbol)
        return hist.ticker_fields_as_of(ts, price)[0] if hist is not None else 0.0001

    def _excluded_indicators(self, timeframe: str, cluster: str) -> frozenset[str]:
        """Union of relevance-pruned indicators and the permanently not-backtestable set
        (NOT_BACKTESTABLE_INDICATORS) -- what every historical-replay IndicatorEngine
        built by this engine should exclude for (timeframe, cluster)."""
        pruned = self.relevance_pruner.get_pruned_indicators(timeframe, cluster)
        return frozenset(pruned) | NOT_BACKTESTABLE_INDICATORS

    def _run_training_pass(
        self,
        symbol: str,
        timeframe: str,
        ohlcv_df: pd.DataFrame,
        train_indices: list[int],
        cluster: str,
        profile: TimeframeStrategyProfile,
        n_relevance_snapshots: int = 5,
        scoring_engine: ScoringEngine | None = None,
    ) -> dict[str, float]:
        """Single in-sample pass that both (a) fits the scoring engine's calibrator on
        realized outcomes and (b) evaluates each indicator's relevance -- computing
        indicators once per bar and feeding both from the same pass rather than looping
        over the training window twice.

        `train_indices` need not be contiguous: run_timeframe_backtest passes a plain
        range, but run_cpcv_backtest passes a purged/embargoed index set (training bars
        whose label window would overlap a held-out test block removed) -- must be given
        in ascending order.

        (a) Calibration (§7): without this, p_win comes from an untrained fallback sigmoid
        with no empirical grounding (see ScoringEngine.fit_calibration). The label is "did
        price rise over the horizon" (not "did the signal's own implied direction win") --
        p_win is consumed elsewhere (OpportunityEngine.package) as P(price up), with
        direction chosen as LONG iff p_win >= 0.50. Labeling relative to the signal's own
        sign would fit a reflected target for x<0 vs x>0, which isotonic regression's
        monotonicity constraint can't represent, and produces an unstable fit.

        (b) Relevance (§7): each indicator's Information Coefficient (correlation between
        its own signed score and the realized forward return) is computed over
        `n_relevance_snapshots` contiguous chunks of this window and fed to
        IndicatorRelevancePruner.record_evaluation() as successive evaluations, so its
        trend-based pruning has multiple snapshots to work with -- the cadence it would see
        from repeated weekly backtests/retrains in production. Returns the most recent
        per-indicator IC for reporting (BacktestTimeframeResult.
        indicator_marginal_contributions); indicators the pruner marks pruned are then
        excluded from the out-of-sample IndicatorEngine the caller builds for this run.
        """
        se = scoring_engine or self.scoring_engine
        horizon = max(1, profile.expected_holding_bars)
        calibration_examples: list[tuple[float, float]] = []
        # One entry per bar: {indicator_name: (score, forward_return)}
        per_bar_indicator_scores: list[dict[str, float]] = []
        per_bar_returns: list[float] = []

        for i in train_indices:
            if i + horizon >= len(ohlcv_df):
                continue
            sub_ohlcv = ohlcv_df.iloc[: i + 1]
            current_price = float(ohlcv_df.iloc[i]["close"])
            future_price = float(ohlcv_df.iloc[i + horizon]["close"])
            bar_ts = ohlcv_df.index[i]
            ticker, book = self._synthetic_ticker_and_book(symbol, current_price, timestamp=bar_ts)
            dvol, dvol_baseline = self._dvol_fields(symbol, bar_ts)

            snap = MarketSnapshot(
                symbol=symbol, timeframe=timeframe, ohlcv=sub_ohlcv, ticker=ticker, order_book=book,
                oi_history=self._oi_window(symbol, bar_ts), dvol=dvol, dvol_baseline=dvol_baseline,
            )
            engine_output = self.indicator_engine.compute_snapshot(snap)
            forward_return = (future_price - current_price) / current_price

            raw_signal = se.compute_calibration_feature(engine_output, timeframe)
            price_rose = 1.0 if forward_return > 0 else 0.0
            calibration_examples.append((raw_signal, price_rose))

            per_bar_indicator_scores.append({r.name: r.score for r in engine_output.results})
            per_bar_returns.append(forward_return)

        se.fit_calibration(calibration_examples)
        if len(calibration_examples) < 20:
            logger.warning(
                "%s %s: only %d calibration examples available (<20) -- calibrator stays "
                "on its untrained fallback sigmoid for this backtest.",
                symbol, timeframe, len(calibration_examples),
            )

        latest_contributions: dict[str, float] = {}
        n_bars = len(per_bar_returns)
        if n_bars >= n_relevance_snapshots * 10:
            chunk_size = n_bars // n_relevance_snapshots
            for snap_idx in range(n_relevance_snapshots):
                c_start = snap_idx * chunk_size
                c_end = n_bars if snap_idx == n_relevance_snapshots - 1 else c_start + chunk_size

                per_indicator_scores: dict[str, list[float]] = {}
                per_indicator_returns: dict[str, list[float]] = {}
                for bar_idx in range(c_start, c_end):
                    ret = per_bar_returns[bar_idx]
                    for name, score in per_bar_indicator_scores[bar_idx].items():
                        if name in NOT_BACKTESTABLE_INDICATORS:
                            continue
                        per_indicator_scores.setdefault(name, []).append(score)
                        per_indicator_returns.setdefault(name, []).append(ret)

                for name, scores in per_indicator_scores.items():
                    returns = per_indicator_returns[name]
                    ic = 0.0
                    if len(scores) >= 10 and float(np.std(scores)) > 1e-9:
                        corr = float(np.corrcoef(scores, returns)[0, 1])
                        ic = 0.0 if math.isnan(corr) else corr
                    self.relevance_pruner.record_evaluation(timeframe, cluster, name, ic)
                    latest_contributions[name] = ic

        return latest_contributions

    def run_timeframe_backtest(
        self,
        symbol: str,
        timeframe: str,
        ohlcv_df: pd.DataFrame,
        funding_rate_series: pd.Series | None = None,
        initial_capital: float = 10_000.0,
        calibration_fraction: float = 0.4,
        cluster: str = "large_cap",
        num_trials: int = 30,
    ) -> BacktestTimeframeResult:
        """Replays strategy across chronological historical bars for one timeframe.

        The leading `calibration_fraction` of usable history is used purely to fit the
        calibrator (§7) and evaluate indicator relevance (§7) on realized outcomes; only
        the remaining out-of-sample bars are forward-simulated and counted toward the
        returned metrics, so results aren't inflated by evaluating on the same data the
        calibrator was fit on or by trading on indicators the in-sample window flags as
        noise.
        """
        profile = self.profiles.get(timeframe) or self.profiles["1h"]

        min_lookback = 40
        usable_range = max(0, len(ohlcv_df) - 5 - min_lookback)
        train_end = min_lookback + int(usable_range * calibration_fraction)
        marginal_contributions = self._run_training_pass(
            symbol, timeframe, ohlcv_df, list(range(min_lookback, train_end)), cluster, profile
        )
        forward_start = max(min_lookback, train_end)

        pruned_names = self._excluded_indicators(timeframe, cluster)
        active_indicator_engine = IndicatorEngine(pruned_indicator_names=pruned_names)
        logger.info(
            "%s %s: excluded %d indicator(s) from the out-of-sample run (relevance-pruned "
            "or not backtestable): %s", symbol, timeframe, len(pruned_names), sorted(pruned_names),
        )

        capital, equity_curve, trade_returns, attributions = self._simulate_segment(
            symbol,
            timeframe,
            ohlcv_df,
            forward_start,
            len(ohlcv_df),
            profile,
            active_indicator_engine,
            initial_capital,
            funding_rate_series,
        )

        return self._finalize_result(
            timeframe,
            profile,
            trade_returns,
            equity_curve,
            attributions,
            initial_capital,
            capital,
            marginal_contributions,
            num_trials,
        )

    def _simulate_segment(
        self,
        symbol: str,
        timeframe: str,
        ohlcv_df: pd.DataFrame,
        start_idx: int,
        end_idx: int,
        profile: TimeframeStrategyProfile,
        indicator_engine: IndicatorEngine,
        starting_capital: float,
        funding_rate_series: pd.Series | None = None,
    ) -> tuple[float, list[float], list[float], list]:
        """Forward-simulates trading across ohlcv_df[start_idx:end_idx] using the given
        (possibly relevance-pruned) indicator engine and this engine's already-fitted
        scoring engine. Shared by run_timeframe_backtest's out-of-sample phase and each
        CPCV fold's test-block simulation (run_cpcv_backtest), so the trading-loop logic
        exists in exactly one place. Returns (ending_capital, equity_curve, trade_returns,
        attributions); equity_curve[0] is `starting_capital`, before the first bar.
        """
        capital = starting_capital
        equity_curve = [capital]
        trade_returns: list[float] = []
        attributions = []

        active_position: Position | None = None
        active_opp = None
        bars_held = 0

        for i in range(start_idx, end_idx):
            sub_ohlcv = ohlcv_df.iloc[: i + 1]
            current_bar = ohlcv_df.iloc[i]
            current_price = float(current_bar["close"])
            bar_ts = ohlcv_df.index[i]

            # 1. Manage Active Position
            if active_position is not None:
                bars_held += 1
                # 8-hour funding rate accrual (e.g. every 8 bars for 1h, or every 32 for 15m).
                # Prefers an explicitly-passed series, then real registered history, then a
                # flat fallback -- see DerivativesHistory.
                funding_accrual = 0.0
                if funding_rate_series is not None:
                    funding_rate = float(funding_rate_series.iloc[i])
                else:
                    funding_rate = self._funding_rate_as_of(symbol, bar_ts, current_price)
                if bars_held % 8 == 0:
                    funding_accrual = active_position.size_notional * funding_rate
                    active_position.accumulated_funding += funding_accrual

                # Update Trailing Stop
                updated_stop = self.risk_manager.calculate_trailing_stop(active_position, current_price)
                if updated_stop:
                    active_position.trailing_stop_price = updated_stop

                # Check Stop / Invalidation / Horizon Exit
                stop_p = active_position.trailing_stop_price or active_position.stop_loss_price
                should_exit = False

                if active_position.direction == TradeDirection.LONG and current_price <= stop_p:
                    should_exit = True
                elif active_position.direction == TradeDirection.SHORT and current_price >= stop_p:
                    should_exit = True
                elif bars_held >= profile.expected_holding_bars:
                    should_exit = True

                if should_exit:
                    # Realistic execution fee & slippage
                    slippage = active_position.size_notional * 0.0004
                    taker_fee = active_position.size_notional * 0.00055

                    trade_attr = self.attribution_engine.attribute_trade(
                        trade_id=f"bt_tr_{i}",
                        position=active_position,
                        opportunity=active_opp,
                        exit_price=current_price,
                        slippage_paid=slippage + taker_fee,
                    )
                    attributions.append(trade_attr)

                    capital += trade_attr.total_pnl
                    trade_returns.append(trade_attr.total_pnl_pct)
                    active_position = None
                    active_opp = None
                    bars_held = 0

            equity_curve.append(capital)

            # 2. Evaluate New Entry if no active position
            if active_position is None and i < end_idx - 5:
                ticker, book = self._synthetic_ticker_and_book(symbol, current_price, timestamp=bar_ts)
                dvol, dvol_baseline = self._dvol_fields(symbol, bar_ts)
                snap = MarketSnapshot(
                    symbol=symbol,
                    timeframe=timeframe,
                    ohlcv=sub_ohlcv,
                    ticker=ticker,
                    order_book=book,
                    oi_history=self._oi_window(symbol, bar_ts),
                    dvol=dvol,
                    dvol_baseline=dvol_baseline,
                )

                engine_output = indicator_engine.compute_snapshot(snap)
                score = self.scoring_engine.score(
                    symbol=symbol,
                    timeframe=timeframe,
                    engine_output=engine_output,
                    ticker=ticker,
                    order_book=book,
                )

                scores_by_pair = {symbol: {timeframe: score}}
                ranked = self.ranking_engine.rank(scores_by_pair, primary_timeframe=timeframe)

                if ranked:
                    cand = ranked[0]
                    opp = self.opportunity_engine.package(cand, ticker, book)
                    dec_res = self.decision_policy.decide(opp)

                    # Record in decision ledger
                    ledger_entry = DecisionLedgerEntry(
                        entry_id=f"bt_dec_{i}",
                        symbol=symbol,
                        timeframe=timeframe,
                        decision=dec_res.decision.value,
                        reason_codes=dec_res.reason_codes,
                        opportunity_snapshot=opp.model_dump(),
                        plain_language_rationale=dec_res.rationale,
                    )
                    self.ledger.record(ledger_entry)

                    if dec_res.decision == DecisionType.TRADE:
                        p_state = PortfolioState(equity=capital, peak_equity=max(equity_curve))
                        sizing = self.risk_manager.size_position(opp, p_state)

                        if sizing.notional_size > 10.0 and sizing.passed_liquidation_stress_check:
                            active_opp = opp
                            active_position = Position(
                                symbol=symbol,
                                direction=opp.direction,
                                entry_price=current_price,
                                size_notional=sizing.notional_size,
                                leverage=sizing.leverage,
                                margin=sizing.margin_required,
                                liquidation_price=sizing.liquidation_price,
                                stop_loss_price=sizing.initial_stop_price,
                                highest_price=current_price,
                                lowest_price=current_price,
                            )
                            bars_held = 0

        return capital, equity_curve, trade_returns, attributions

    @staticmethod
    def _finalize_result(
        timeframe: str,
        profile: TimeframeStrategyProfile,
        trade_returns: list[float],
        equity_curve: list[float],
        attributions: list,
        initial_capital: float,
        capital: float,
        indicator_marginal_contributions: dict[str, float] | None = None,
        num_trials: int = 30,
    ) -> BacktestTimeframeResult:
        """Shared metrics computation + gating check for any bar-replay backtest loop.

        `num_trials` feeds the Deflated Sharpe Ratio's multiple-comparisons correction
        (Bailey & Lopez de Prado) -- it should reflect how many distinct strategy
        configurations (indicator subsets, timeframes, symbols, thresholds) the researcher
        has now tried in total, not the fold count within this one run. The default of 30
        is a rough placeholder; when actually comparing several configurations against each
        other to pick a "best" one, pass the real cumulative count -- understating it makes
        DSR too easy to clear precisely when overfitting risk is highest.
        """
        returns_arr = np.array(trade_returns, dtype=float) if trade_returns else np.array([0.0])
        total_trades = len(trade_returns)
        wins = int(np.sum(returns_arr > 0))
        losses = int(np.sum(returns_arr < 0))
        win_rate = wins / max(total_trades, 1)

        gross_gains = float(np.sum(returns_arr[returns_arr > 0])) if wins > 0 else 0.0
        gross_losses = float(abs(np.sum(returns_arr[returns_arr < 0]))) if losses > 0 else 1.0
        profit_factor = gross_gains / max(gross_losses, 1e-6)

        expected_value = float(np.mean(returns_arr)) if total_trades > 0 else 0.0

        # Peak Drawdown
        peak = initial_capital
        max_dd = 0.0
        for eq in equity_curve:
            if eq > peak:
                peak = eq
            dd = (peak - eq) / peak if peak > 0 else 0.0
            if dd > max_dd:
                max_dd = dd

        cvar = calculate_cvar(returns_arr, alpha=0.05)
        dsr = calculate_deflated_sharpe_ratio(returns_arr, num_trials=num_trials)
        mean_r = float(np.mean(returns_arr))
        std_r = float(np.std(returns_arr, ddof=1)) if len(returns_arr) > 1 else 1.0
        sharpe = mean_r / std_r * math.sqrt(252) if std_r > 0 else 0.0

        # Gating check against profile floors (§7, §10, §13)
        metrics_dict = {
            "expected_value": expected_value,
            "profit_factor": profit_factor,
            "max_drawdown": max_dd,
            "deflated_sharpe_ratio": dsr,
        }
        passed_gating, reasons = profile.validate_gating(metrics_dict)

        return BacktestTimeframeResult(
            timeframe=timeframe,
            total_trades=total_trades,
            winning_trades=wins,
            losing_trades=losses,
            win_rate=win_rate,
            expected_value=expected_value,
            profit_factor=profit_factor,
            max_drawdown=max_dd,
            tail_loss_cvar=cvar,
            deflated_sharpe_ratio=dsr,
            sharpe_ratio=sharpe,
            total_return_pct=(capital - initial_capital) / initial_capital,
            equity_curve=equity_curve,
            passed_gating=passed_gating,
            gating_rejection_reasons=reasons,
            trade_attributions=attributions,
            indicator_marginal_contributions=indicator_marginal_contributions or {},
        )

    def run_convex_growth_backtest(
        self,
        symbol: str,
        ohlcv_by_tf: dict[str, pd.DataFrame],
        initial_capital: float = 100.0,
        calibration_fraction: float = 0.4,
        convex_strategy: ConvexGrowthStrategy | None = None,
        cluster: str = "large_cap",
        num_trials: int = 30,
    ) -> BacktestTimeframeResult:
        """Replays the ConvexGrowthStrategy (hierarchical 4H/1H/15M small-account strategy)
        across chronological 15m bars, using time-aligned slices of the 1h/4h OHLCV history
        for the regime/confirmation reads. This is the strategy actually designed for small
        (<$250) accounts -- see sisera/strategy/convex_growth.py -- which previously sat
        instantiated but never called from either live orchestration or the backtest engine.

        `ohlcv_by_tf` must contain "15m", "1h", and "4h" keys (DatetimeIndex, UTC).
        """
        strategy = convex_strategy or ConvexGrowthStrategy()
        profile = self.profiles.get("15m") or self.profiles["1h"]

        df_15m = ohlcv_by_tf["15m"]
        df_1h = ohlcv_by_tf["1h"]
        df_4h = ohlcv_by_tf["4h"]

        capital = initial_capital
        equity_curve = [capital]
        trade_returns: list[float] = []
        attributions = []

        active_position: Position | None = None
        active_opp = None
        active_target_price: float | None = None
        bars_held = 0

        min_lookback = 40
        usable_range = max(0, len(df_15m) - 5 - min_lookback)
        train_end_15m = min_lookback + int(usable_range * calibration_fraction)
        forward_start = max(min_lookback, train_end_15m)
        # Everything used to fit any timeframe's calibrator/relevance must predate the
        # point where 15m forward-simulation begins -- otherwise a 1h/4h fit trained on
        # data from "the future" (relative to the 15m trading window) would leak into
        # decisions made during that window, even though 1h/4h only ever get read via
        # `.loc[:ts]` slices during the loop itself.
        split_ts = df_15m.index[forward_start]

        # ScoringEngine holds one shared calibrator; scoring 4H/1H/15M through a single
        # instance would let whichever timeframe fits last silently overwrite the others'
        # calibration curve. Each timeframe gets its own engine + independent fit instead.
        scoring_engines_by_tf: dict[str, ScoringEngine] = {
            "4h": ScoringEngine(), "1h": ScoringEngine(), "15m": ScoringEngine(),
        }
        marginal_contributions: dict[str, float] = {}
        for tf_name, tf_df in (("4h", df_4h), ("1h", df_1h), ("15m", df_15m)):
            tf_train_end = min(int(tf_df.index.searchsorted(split_ts)), len(tf_df) - 5)
            if tf_train_end <= min_lookback:
                continue
            tf_profile = self.profiles.get(tf_name) or self.profiles["1h"]
            contributions = self._run_training_pass(
                symbol, tf_name, tf_df, list(range(min_lookback, tf_train_end)), cluster, tf_profile,
                scoring_engine=scoring_engines_by_tf[tf_name],
            )
            marginal_contributions.update({f"{tf_name}/{k}": v for k, v in contributions.items()})

        engines_by_tf: dict[str, IndicatorEngine] = {}
        for tf_name in ("4h", "1h", "15m"):
            pruned_names = self._excluded_indicators(tf_name, cluster)
            engines_by_tf[tf_name] = IndicatorEngine(pruned_indicator_names=pruned_names)
            logger.info(
                "%s %s: excluded %d indicator(s) from the out-of-sample run (relevance-pruned "
                "or not backtestable): %s", symbol, tf_name, len(pruned_names), sorted(pruned_names),
            )

        for i in range(forward_start, len(df_15m)):
            sub_15m = df_15m.iloc[: i + 1]
            current_bar = df_15m.iloc[i]
            current_price = float(current_bar["close"])
            ts = df_15m.index[i]

            sub_1h = df_1h.loc[:ts]
            sub_4h = df_4h.loc[:ts]

            # 1. Manage Active Position (fixed stop-loss / take-profit bracket per the
            # signal's target R:R geometry -- Convex Growth trades a defined bracket, not
            # an ATR trailing stop)
            if active_position is not None:
                bars_held += 1
                funding_accrual = 0.0
                if bars_held % 32 == 0:  # ~8h at 15m bars
                    funding_rate = self._funding_rate_as_of(symbol, ts, current_price)
                    funding_accrual = active_position.size_notional * funding_rate
                    active_position.accumulated_funding += funding_accrual

                stop_p = active_position.stop_loss_price
                should_exit = False
                if active_position.direction == TradeDirection.LONG:
                    hit_stop = current_price <= stop_p
                    hit_target = active_target_price is not None and current_price >= active_target_price
                    if hit_stop or hit_target:
                        should_exit = True
                else:
                    hit_stop = current_price >= stop_p
                    hit_target = active_target_price is not None and current_price <= active_target_price
                    if hit_stop or hit_target:
                        should_exit = True
                if bars_held >= profile.expected_holding_bars:
                    should_exit = True

                if should_exit:
                    slippage = active_position.size_notional * 0.0004
                    taker_fee = active_position.size_notional * 0.00055
                    trade_attr = self.attribution_engine.attribute_trade(
                        trade_id=f"bt_cx_{i}",
                        position=active_position,
                        opportunity=active_opp,
                        exit_price=current_price,
                        slippage_paid=slippage + taker_fee,
                    )
                    attributions.append(trade_attr)
                    capital += trade_attr.total_pnl
                    trade_returns.append(trade_attr.total_pnl_pct)
                    active_position = None
                    active_opp = None
                    active_target_price = None
                    bars_held = 0

            equity_curve.append(capital)

            # 2. Evaluate New Entry via the hierarchical Convex Growth signal
            has_lookback = len(sub_1h) >= 40 and len(sub_4h) >= 40
            if active_position is None and i < len(df_15m) - 5 and has_lookback:
                ticker, book = self._synthetic_ticker_and_book(symbol, current_price, timestamp=ts)
                oi_hist = self._oi_window(symbol, ts)
                dvol, dvol_baseline = self._dvol_fields(symbol, ts)

                scores_by_tf: dict[str, object] = {}
                for tf_name, tf_df in (("4h", sub_4h), ("1h", sub_1h), ("15m", sub_15m)):
                    snap = MarketSnapshot(
                        symbol=symbol, timeframe=tf_name, ohlcv=tf_df, ticker=ticker, order_book=book,
                        oi_history=oi_hist, dvol=dvol, dvol_baseline=dvol_baseline,
                    )
                    engine_output = engines_by_tf[tf_name].compute_snapshot(snap)
                    scores_by_tf[tf_name] = scoring_engines_by_tf[tf_name].score(
                        symbol=symbol,
                        timeframe=tf_name,
                        engine_output=engine_output,
                        ticker=ticker,
                        order_book=book,
                    )

                btc_stability = scores_by_tf["4h"].regime_state.stability_score
                signal = strategy.evaluate_candidate(
                    symbol=symbol,
                    scores_by_tf=scores_by_tf,
                    ticker=ticker,
                    order_book=book,
                    btc_stability=btc_stability,
                    account_equity=capital,
                )

                if signal is not None:
                    ranked = self.ranking_engine.rank({symbol: scores_by_tf}, primary_timeframe="15m")
                    if ranked:
                        opp = self.opportunity_engine.package(ranked[0], ticker, book)
                        # Override with the Convex Growth signal's own directional thesis and
                        # fixed asymmetric R:R geometry rather than the generic ATR-based one.
                        opp.direction = signal.direction
                        opp.expected_value = signal.calibrated_ev_r
                        opp.ev_r = signal.calibrated_ev_r
                        opp.p_win = signal.calibrated_p_win
                        stop_dist = current_price * signal.stop_distance_pct
                        target_dist = current_price * signal.target_profit_pct
                        if signal.direction == TradeDirection.LONG:
                            opp.invalidation_price = current_price - stop_dist
                            target_price = current_price + target_dist
                        else:
                            opp.invalidation_price = current_price + stop_dist
                            target_price = current_price - target_dist

                        dec_res = self.decision_policy.decide(opp)
                        ledger_entry = DecisionLedgerEntry(
                            entry_id=f"bt_cx_dec_{i}",
                            symbol=symbol,
                            timeframe="15m",
                            decision=dec_res.decision.value,
                            reason_codes=dec_res.reason_codes,
                            opportunity_snapshot=opp.model_dump(),
                            plain_language_rationale=dec_res.rationale,
                        )
                        self.ledger.record(ledger_entry)

                        if dec_res.decision == DecisionType.TRADE:
                            p_state = PortfolioState(equity=capital, peak_equity=max(equity_curve))
                            sizing = self.risk_manager.size_position(opp, p_state)

                            if sizing.notional_size > 10.0 and sizing.passed_liquidation_stress_check:
                                active_opp = opp
                                active_target_price = target_price
                                active_position = Position(
                                    symbol=symbol,
                                    direction=opp.direction,
                                    entry_price=current_price,
                                    size_notional=sizing.notional_size,
                                    leverage=sizing.leverage,
                                    margin=sizing.margin_required,
                                    liquidation_price=sizing.liquidation_price,
                                    stop_loss_price=opp.invalidation_price,
                                    highest_price=current_price,
                                    lowest_price=current_price,
                                )
                                bars_held = 0

        return self._finalize_result(
            "15m",
            profile,
            trade_returns,
            equity_curve,
            attributions,
            initial_capital,
            capital,
            marginal_contributions,
            num_trials,
        )

    def run_cpcv_backtest(
        self,
        symbol: str,
        timeframe: str,
        ohlcv_df: pd.DataFrame,
        initial_capital: float = 10_000.0,
        n_groups: int = 6,
        test_group_size: int = 2,
        embargo_bars: int | None = None,
        cluster: str = "large_cap",
        num_trials: int = 30,
    ) -> CPCVResult:
        """Combinatorial Purged Cross-Validation (§7, §10) -- see CPCVResult's docstring
        for exactly what this does and doesn't guarantee relative to the textbook
        algorithm.

        `num_trials` should reflect how many distinct strategy configurations have been
        compared in total when this call is part of a search over several candidates (see
        _finalize_result) -- it materially changes how hard the DSR floor is to clear.

        Partitions the usable bar range into `n_groups` contiguous blocks and evaluates
        every combination of `test_group_size` blocks as a held-out fold: fits calibration
        and indicator relevance on the remaining blocks (purging any training bar whose
        forward-return label window overlaps a held-out block, plus `embargo_bars` after
        each held-out block to guard against serial-correlation leakage), then forward-
        simulates only on the held-out blocks with a calibrator fit on *only* that fold's
        purged training set. C(n_groups, test_group_size) folds total -- 6 choose 2 = 15 by
        default -- so this costs roughly n_folds x a single run_timeframe_backtest call on
        the same data; pass smaller n_groups/test_group_size for a quicker, coarser check.

        A single train/test split (what run_timeframe_backtest's calibration_fraction
        does) can pass gating by luck. `fold_pass_rate` -- the fraction of folds that
        independently clear the same EV/PF/DD/DSR floors -- is the real answer to "does
        this hold up," not any one split.
        """
        profile = self.profiles.get(timeframe) or self.profiles["1h"]
        horizon = max(1, profile.expected_holding_bars)
        if embargo_bars is None:
            embargo_bars = max(1, horizon // 2)

        min_lookback = 40
        usable_end = len(ohlcv_df) - horizon - 5
        if usable_end <= min_lookback + n_groups:
            raise ValueError(
                f"Not enough history for {n_groups}-group CPCV on {symbol} {timeframe}: "
                f"need > {min_lookback + n_groups} usable bars, have "
                f"{max(0, usable_end - min_lookback)}"
            )

        block_size = (usable_end - min_lookback) // n_groups
        blocks = [
            (
                min_lookback + g * block_size,
                min_lookback + (g + 1) * block_size if g < n_groups - 1 else usable_end,
            )
            for g in range(n_groups)
        ]

        combos = list(itertools.combinations(range(n_groups), test_group_size))
        fold_results: list[BacktestTimeframeResult] = []
        pooled_trade_returns: list[float] = []
        pooled_equity: list[float] = []
        pooled_attributions = []

        original_scoring_engine = self.scoring_engine
        try:
            for combo in combos:
                test_blocks = [blocks[g] for g in combo]

                train_indices: list[int] = []
                for g in range(n_groups):
                    if g in combo:
                        continue
                    s, e = blocks[g]
                    for i in range(s, e):
                        label_end = i + horizon
                        purged = any(i < te and label_end >= ts for ts, te in test_blocks)
                        embargoed = any(te <= i < te + embargo_bars for _, te in test_blocks)
                        if not purged and not embargoed:
                            train_indices.append(i)

                fold_scoring_engine = ScoringEngine()
                self._run_training_pass(
                    symbol, timeframe, ohlcv_df, train_indices, cluster, profile,
                    scoring_engine=fold_scoring_engine,
                )

                pruned_names = self._excluded_indicators(timeframe, cluster)
                fold_indicator_engine = IndicatorEngine(pruned_indicator_names=pruned_names)

                # _simulate_segment scores through self.scoring_engine -- swap in this
                # fold's own calibrator (fit on only this fold's purged training set) for
                # the duration of its test-block simulation.
                self.scoring_engine = fold_scoring_engine
                fold_capital = initial_capital
                fold_trade_returns: list[float] = []
                fold_equity: list[float] = []
                fold_attributions = []
                for ts, te in sorted(test_blocks):
                    fold_capital, seg_equity, seg_returns, seg_attr = self._simulate_segment(
                        symbol, timeframe, ohlcv_df, ts, te, profile,
                        fold_indicator_engine, fold_capital,
                    )
                    fold_equity.extend(seg_equity)
                    fold_trade_returns.extend(seg_returns)
                    fold_attributions.extend(seg_attr)

                fold_result = self._finalize_result(
                    timeframe, profile, fold_trade_returns, fold_equity, fold_attributions,
                    initial_capital, fold_capital, num_trials=num_trials,
                )
                fold_results.append(fold_result)
                pooled_trade_returns.extend(fold_trade_returns)
                pooled_equity.extend(fold_equity)
                pooled_attributions.extend(fold_attributions)
        finally:
            self.scoring_engine = original_scoring_engine

        # Pooled EV/PF/DSR/CVaR are computed purely from pooled_trade_returns (each a
        # %-of-notional figure, scale-free) and are meaningful aggregate statistics.
        # pooled_equity is fold equity curves chained end-to-end -- each fold restarts
        # from initial_capital, so it has a discontinuity at every fold boundary and its
        # max_drawdown/total_return_pct should be read as illustrative, not literal.
        pooled_result = self._finalize_result(
            timeframe,
            profile,
            pooled_trade_returns,
            pooled_equity,
            pooled_attributions,
            initial_capital,
            pooled_equity[-1] if pooled_equity else initial_capital,
            num_trials=num_trials,
        )

        folds_passed = sum(1 for r in fold_results if r.passed_gating)
        return CPCVResult(
            symbol=symbol,
            timeframe=timeframe,
            n_groups=n_groups,
            test_group_size=test_group_size,
            n_folds=len(combos),
            embargo_bars=embargo_bars,
            fold_results=fold_results,
            folds_passed_gating=folds_passed,
            fold_pass_rate=folds_passed / max(1, len(combos)),
            pooled_result=pooled_result,
            dsr_by_fold=[r.deflated_sharpe_ratio for r in fold_results],
            ev_by_fold=[r.expected_value for r in fold_results],
        )
