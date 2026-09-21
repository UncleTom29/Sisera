from __future__ import annotations

import logging
from dataclasses import dataclass

import pandas as pd

from sisera.data.models import (
    CoinMarketData,
    CrossVenueFundingRate,
    DeribitOptionTicker,
    LiquidationEvent,
    LLMFundamentalAssessment,
    LongShortRatio,
    MacroSnapshot,
    NewsAssessment,
    OrderBook,
    Ticker,
)
from sisera.indicators.base import Indicator, IndicatorResult
from sisera.indicators.composite import (
    RegimeState,
    compute_liquidity_adjusted_momentum,
    compute_regime_detector,
    compute_smart_money_divergence,
)
from sisera.indicators.derivatives import (
    compute_basis,
    compute_cross_venue_funding_divergence,
    compute_funding_rate,
    compute_liquidation_cascade,
    compute_long_short_ratio,
    compute_mark_index_divergence,
    compute_open_interest_trend,
    compute_order_book_imbalance,
)
from sisera.indicators.fundamental import (
    compute_market_cap_tier,
    compute_mcap_volume_ratio,
    compute_onchain_activity_trend,
    compute_supply_dilution_risk,
)
from sisera.indicators.llm_fundamental import compute_llm_fundamental_analysis
from sisera.indicators.macro import compute_macro_regime
from sisera.indicators.news_sentiment import compute_news_sentiment
from sisera.indicators.options import (
    compute_implied_volatility,
    compute_put_call_skew,
)
from sisera.indicators.technical import default_technical_indicators

logger = logging.getLogger(__name__)


@dataclass
class MarketSnapshot:
    """Complete multi-family market data snapshot for one pair and timeframe."""

    symbol: str
    timeframe: str
    ohlcv: pd.DataFrame
    ticker: Ticker | None = None
    order_book: OrderBook | None = None
    oi_history: pd.DataFrame | None = None
    long_short_ratio: LongShortRatio | None = None
    cross_venue_funding: CrossVenueFundingRate | None = None
    liquidation_events: list[LiquidationEvent] | None = None
    market_data: CoinMarketData | None = None
    tx_count_history: pd.Series | None = None
    dvol: float | None = None
    dvol_baseline: float | None = None
    option_tickers: list[DeribitOptionTicker] | None = None
    llm_fundamental: LLMFundamentalAssessment | None = None
    news_assessment: NewsAssessment | None = None
    macro_snapshot: MacroSnapshot | None = None


@dataclass
class EngineOutput:
    """Output of IndicatorEngine across all indicator families."""

    results: list[IndicatorResult]
    regime_state: RegimeState
    coverage_ratio: float  # Fraction of applicable indicators successfully computed


class IndicatorEngine:
    """Multi-family indicator engine executing technical, derivatives, options, fundamental,

    and composite indicators with data completeness tracking. See SCOPE.md §2, §5.
    """

    def __init__(
        self,
        technical_indicators: list[Indicator] | None = None,
        pruned_indicator_names: set[str] | None = None,
    ) -> None:
        self._technical = technical_indicators or default_technical_indicators()
        self._pruned_names = pruned_indicator_names or set()

    def is_pruned(self, name: str) -> bool:
        return name in self._pruned_names

    def compute_technical(self, ohlcv: pd.DataFrame) -> list[IndicatorResult]:
        results: list[IndicatorResult] = []
        for indicator in self._technical:
            if self.is_pruned(indicator.name):
                continue
            if len(ohlcv) < indicator.min_periods:
                continue
            try:
                results.append(indicator.compute(ohlcv))
            except Exception as exc:  # noqa: BLE001
                logger.warning("Technical indicator %s failed: %s", indicator.name, exc)
        return results

    def compute_all(self, ohlcv: pd.DataFrame) -> list[IndicatorResult]:
        """Backward-compatible method for pure OHLCV technical compute."""
        return self.compute_technical(ohlcv)

    def compute_snapshot(self, snapshot: MarketSnapshot) -> EngineOutput:
        """Evaluates all five indicator families for a full market snapshot."""
        results: list[IndicatorResult] = []
        total_applicable = 0

        # 1. Technical Family
        tech_results = self.compute_technical(snapshot.ohlcv)
        results.extend(tech_results)
        total_applicable += len([i for i in self._technical if not self.is_pruned(i.name)])

        # 2. Derivatives Microstructure Family
        if snapshot.ticker is not None:
            if not self.is_pruned("funding_rate"):
                total_applicable += 1
                try:
                    results.append(compute_funding_rate(snapshot.ticker))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("funding_rate indicator failed: %s", exc)

            if not self.is_pruned("basis"):
                total_applicable += 1
                try:
                    results.append(compute_basis(snapshot.ticker))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("basis indicator failed: %s", exc)

            if not self.is_pruned("mark_index_divergence"):
                total_applicable += 1
                try:
                    results.append(compute_mark_index_divergence(snapshot.ticker))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("mark_index_divergence indicator failed: %s", exc)

        if snapshot.order_book is not None and not self.is_pruned("order_book_imbalance"):
            total_applicable += 1
            try:
                results.append(compute_order_book_imbalance(snapshot.order_book))
            except Exception as exc:  # noqa: BLE001
                logger.warning("order_book_imbalance indicator failed: %s", exc)

        if snapshot.long_short_ratio is not None and not self.is_pruned("long_short_ratio"):
            total_applicable += 1
            try:
                results.append(compute_long_short_ratio(snapshot.long_short_ratio))
            except Exception as exc:  # noqa: BLE001
                logger.warning("long_short_ratio indicator failed: %s", exc)

        if (
            snapshot.oi_history is not None
            and len(snapshot.oi_history) > 1
            and len(snapshot.ohlcv) > 1
            and not self.is_pruned("open_interest_trend")
        ):
            total_applicable += 1
            try:
                results.append(compute_open_interest_trend(snapshot.oi_history, snapshot.ohlcv["close"]))
            except Exception as exc:  # noqa: BLE001
                logger.warning("open_interest_trend indicator failed: %s", exc)

        if (
            snapshot.ticker is not None
            and snapshot.cross_venue_funding is not None
            and not self.is_pruned("cross_venue_funding_divergence")
        ):
            total_applicable += 1
            try:
                results.append(
                    compute_cross_venue_funding_divergence(snapshot.ticker, snapshot.cross_venue_funding)
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("cross_venue_funding_divergence indicator failed: %s", exc)

        if snapshot.liquidation_events is not None and not self.is_pruned("liquidation_cascade"):
            total_applicable += 1
            try:
                results.append(compute_liquidation_cascade(snapshot.liquidation_events))
            except Exception as exc:  # noqa: BLE001
                logger.warning("liquidation_cascade indicator failed: %s", exc)

        # 3. Fundamental Family
        if snapshot.market_data is not None:
            if not self.is_pruned("market_cap_tier"):
                total_applicable += 1
                try:
                    results.append(compute_market_cap_tier(snapshot.market_data))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("market_cap_tier indicator failed: %s", exc)

            if not self.is_pruned("mcap_volume_ratio"):
                total_applicable += 1
                try:
                    results.append(compute_mcap_volume_ratio(snapshot.market_data))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("mcap_volume_ratio indicator failed: %s", exc)

            if not self.is_pruned("supply_dilution_risk"):
                total_applicable += 1
                try:
                    results.append(compute_supply_dilution_risk(snapshot.market_data))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("supply_dilution_risk indicator failed: %s", exc)

        if (
            snapshot.tx_count_history is not None
            and len(snapshot.tx_count_history) > 1
            and not self.is_pruned("onchain_activity_trend")
        ):
            total_applicable += 1
            try:
                results.append(compute_onchain_activity_trend(snapshot.tx_count_history))
            except Exception as exc:  # noqa: BLE001
                logger.warning("onchain_activity_trend indicator failed: %s", exc)

        if snapshot.llm_fundamental is not None and not self.is_pruned("llm_fundamental_analysis"):
            total_applicable += 1
            try:
                results.append(compute_llm_fundamental_analysis(snapshot.llm_fundamental))
            except Exception as exc:  # noqa: BLE001
                logger.warning("llm_fundamental_analysis indicator failed: %s", exc)

        if snapshot.news_assessment is not None and not self.is_pruned("news_sentiment"):
            total_applicable += 1
            try:
                results.append(compute_news_sentiment(snapshot.news_assessment))
            except Exception as exc:  # noqa: BLE001
                logger.warning("news_sentiment indicator failed: %s", exc)

        if snapshot.macro_snapshot is not None and not self.is_pruned("macro_regime"):
            total_applicable += 1
            try:
                results.append(compute_macro_regime(snapshot.macro_snapshot))
            except Exception as exc:  # noqa: BLE001
                logger.warning("macro_regime indicator failed: %s", exc)

        # 4. Options Family (BTC/ETH only)
        is_options_applicable = snapshot.symbol.upper().startswith(("BTC", "ETH"))
        if is_options_applicable:
            if snapshot.dvol is not None and not self.is_pruned("implied_volatility"):
                total_applicable += 1
                try:
                    results.append(compute_implied_volatility(snapshot.dvol, snapshot.dvol_baseline))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("implied_volatility indicator failed: %s", exc)

            if snapshot.option_tickers and not self.is_pruned("put_call_skew"):
                total_applicable += 1
                try:
                    results.append(compute_put_call_skew(snapshot.option_tickers))
                except Exception as exc:  # noqa: BLE001
                    logger.warning("put_call_skew indicator failed: %s", exc)

        # 5. Composite Family & Regime Detector
        liq_net = 0.0
        has_liq_cluster = False
        if snapshot.liquidation_events:
            long_liq = sum(e.notional for e in snapshot.liquidation_events if e.side == "Sell")
            short_liq = sum(e.notional for e in snapshot.liquidation_events if e.side == "Buy")
            liq_net = short_liq - long_liq
            has_liq_cluster = (long_liq + short_liq) > 500_000.0

        regime_res, regime_state = compute_regime_detector(
            snapshot.ohlcv,
            recent_liq_notional_net=liq_net,
            liq_cluster_detected=has_liq_cluster,
        )
        if not self.is_pruned("regime_detector"):
            total_applicable += 1
            results.append(regime_res)

        # Smart money divergence
        if not self.is_pruned("smart_money_divergence"):
            total_applicable += 1
            price_pct = (
                (snapshot.ohlcv["close"].iloc[-1] / snapshot.ohlcv["close"].iloc[0] - 1)
                if len(snapshot.ohlcv) > 1
                else 0.0
            )
            funding = snapshot.ticker.funding_rate if snapshot.ticker else 0.0
            oi_pct = 0.0
            if snapshot.oi_history is not None and len(snapshot.oi_history) > 1:
                oi_pct = (
                    snapshot.oi_history["open_interest"].iloc[-1]
                    / snapshot.oi_history["open_interest"].iloc[0]
                    - 1
                )
            short_notional = (
                sum(e.notional for e in snapshot.liquidation_events if e.side == "Buy")
                if snapshot.liquidation_events
                else 0.0
            )
            long_notional = (
                sum(e.notional for e in snapshot.liquidation_events if e.side == "Sell")
                if snapshot.liquidation_events
                else 0.0
            )
            try:
                results.append(
                    compute_smart_money_divergence(
                        price_pct_change=price_pct,
                        funding_rate=funding,
                        oi_pct_change=oi_pct,
                        short_liq_notional=short_notional,
                        long_liq_notional=long_notional,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("smart_money_divergence indicator failed: %s", exc)

        # Liquidity adjusted momentum
        if not self.is_pruned("liquidity_adjusted_momentum"):
            total_applicable += 1
            # Find technical momentum indicator if present
            raw_mom = next((r.score for r in tech_results if r.name in ("rsi", "macd")), 0.0)
            try:
                results.append(
                    compute_liquidity_adjusted_momentum(
                        raw_momentum_score=raw_mom,
                        order_book=snapshot.order_book,
                        market_data=snapshot.market_data,
                    )
                )
            except Exception as exc:  # noqa: BLE001
                logger.warning("liquidity_adjusted_momentum indicator failed: %s", exc)

        coverage = len(results) / max(total_applicable, 1)
        return EngineOutput(results=results, regime_state=regime_state, coverage_ratio=coverage)
