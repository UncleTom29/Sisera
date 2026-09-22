"""Timeframe Strategy Profiles. See SCOPE.md §7, §5.

Each traded timeframe gets its own validated indicator composition, family weights,
and independent gating thresholds on Expected Value, profit factor, and risk metrics.
Win rate is diagnostic and visible per timeframe, not a hard gate.
"""

from __future__ import annotations

from dataclasses import dataclass

from sisera.config import config
from sisera_quant_scoring.models import IndicatorFamily


@dataclass(frozen=True)
class TimeframeStrategyProfile:
    """Strategy profile defining applicable indicators, weights, and gating criteria per timeframe."""

    timeframe: str
    dominant_families: list[IndicatorFamily]
    family_weights: dict[IndicatorFamily, float]
    indicator_inclusion_set: set[str]
    ev_floor: float
    profit_factor_floor: float
    max_drawdown_floor: float
    deflated_sharpe_floor: float
    expected_holding_bars: int

    def is_indicator_applicable(self, indicator_name: str) -> bool:
        return indicator_name in self.indicator_inclusion_set

    def validate_gating(self, backtest_metrics: dict[str, float]) -> tuple[bool, list[str]]:
        """Checks whether this timeframe profile clears its independent gating floors.

        Win rate is diagnostic, not gating (§1, §7).
        """
        reasons: list[str] = []
        ev = backtest_metrics.get("expected_value", 0.0)
        pf = backtest_metrics.get("profit_factor", 0.0)
        dd = backtest_metrics.get("max_drawdown", 1.0)
        dsr = backtest_metrics.get("deflated_sharpe_ratio", 0.0)

        if ev < self.ev_floor:
            reasons.append(f"EV ({ev:.3f}) below floor ({self.ev_floor:.3f})")
        if pf < self.profit_factor_floor:
            reasons.append(f"Profit factor ({pf:.2f}) below floor ({self.profit_factor_floor:.2f})")
        if dd > self.max_drawdown_floor:
            reasons.append(f"Max drawdown ({dd:.2%}) exceeds floor ({self.max_drawdown_floor:.2%})")
        if dsr < self.deflated_sharpe_floor:
            reasons.append(f"Deflated Sharpe ({dsr:.2f}) below floor ({self.deflated_sharpe_floor:.2f})")

        passed = len(reasons) == 0
        return passed, reasons


def default_timeframe_profiles() -> dict[str, TimeframeStrategyProfile]:
    """Generates standard strategy profiles for 15m, 1h, 4h, and 1d timeframes."""
    # 15m: Short horizon dominated by fast microstructure & cascades
    p_15m = TimeframeStrategyProfile(
        timeframe="15m",
        dominant_families=[
            IndicatorFamily.DERIVATIVES,
            IndicatorFamily.COMPOSITE,
            IndicatorFamily.TECHNICAL,
        ],
        family_weights={
            IndicatorFamily.DERIVATIVES: 0.40,
            IndicatorFamily.COMPOSITE: 0.30,
            IndicatorFamily.TECHNICAL: 0.25,
            IndicatorFamily.FUNDAMENTAL: 0.05,
            IndicatorFamily.OPTIONS: 0.00,
        },
        indicator_inclusion_set={
            "liquidation_cascade",
            "order_book_imbalance",
            "mark_index_divergence",
            "basis",
            "smart_money_divergence",
            "regime_detector",
            "liquidity_adjusted_momentum",
            "rsi",
            "macd",
            "bollinger_band_width",
            "atr",
        },
        ev_floor=config.ev_floor_15m,
        profit_factor_floor=config.profit_factor_floor,
        max_drawdown_floor=config.max_drawdown_floor,
        deflated_sharpe_floor=config.deflated_sharpe_floor,
        expected_holding_bars=8,
    )

    # 1h: Short/medium horizon combining technical structure and funding/OI
    p_1h = TimeframeStrategyProfile(
        timeframe="1h",
        dominant_families=[
            IndicatorFamily.TECHNICAL,
            IndicatorFamily.DERIVATIVES,
            IndicatorFamily.COMPOSITE,
        ],
        family_weights={
            IndicatorFamily.TECHNICAL: 0.35,
            IndicatorFamily.DERIVATIVES: 0.35,
            IndicatorFamily.COMPOSITE: 0.20,
            IndicatorFamily.FUNDAMENTAL: 0.10,
            IndicatorFamily.OPTIONS: 0.00,
        },
        indicator_inclusion_set={
            "ema_crossover",
            "rsi",
            "macd",
            "atr",
            "bollinger_band_width",
            "obv",
            "funding_rate",
            "open_interest_trend",
            "long_short_ratio",
            "cross_venue_funding_divergence",
            "smart_money_divergence",
            "regime_detector",
            "liquidity_adjusted_momentum",
            "market_cap_tier",
            "mcap_volume_ratio",
        },
        ev_floor=config.ev_floor_1h,
        profit_factor_floor=config.profit_factor_floor,
        max_drawdown_floor=config.max_drawdown_floor,
        deflated_sharpe_floor=config.deflated_sharpe_floor,
        expected_holding_bars=12,
    )

    # 4h: Medium horizon aligned with 8h funding cycle
    p_4h = TimeframeStrategyProfile(
        timeframe="4h",
        dominant_families=[
            IndicatorFamily.DERIVATIVES,
            IndicatorFamily.TECHNICAL,
            IndicatorFamily.FUNDAMENTAL,
        ],
        family_weights={
            IndicatorFamily.DERIVATIVES: 0.35,
            IndicatorFamily.TECHNICAL: 0.35,
            IndicatorFamily.FUNDAMENTAL: 0.15,
            IndicatorFamily.COMPOSITE: 0.15,
            IndicatorFamily.OPTIONS: 0.00,
        },
        indicator_inclusion_set={
            "ema_crossover",
            "rsi",
            "macd",
            "atr",
            "obv",
            "funding_rate",
            "open_interest_trend",
            "long_short_ratio",
            "cross_venue_funding_divergence",
            "market_cap_tier",
            "mcap_volume_ratio",
            "supply_dilution_risk",
            "smart_money_divergence",
            "regime_detector",
        },
        ev_floor=config.ev_floor_4h,
        profit_factor_floor=config.profit_factor_floor,
        max_drawdown_floor=config.max_drawdown_floor,
        deflated_sharpe_floor=config.deflated_sharpe_floor,
        expected_holding_bars=18,
    )

    # 1d: Longer holds where options IV/skew and fundamentals matter
    p_1d = TimeframeStrategyProfile(
        timeframe="1d",
        dominant_families=[
            IndicatorFamily.TECHNICAL,
            IndicatorFamily.OPTIONS,
            IndicatorFamily.FUNDAMENTAL,
        ],
        family_weights={
            IndicatorFamily.TECHNICAL: 0.35,
            IndicatorFamily.OPTIONS: 0.25,
            IndicatorFamily.FUNDAMENTAL: 0.20,
            IndicatorFamily.DERIVATIVES: 0.10,
            IndicatorFamily.COMPOSITE: 0.10,
        },
        indicator_inclusion_set={
            "ema_crossover",
            "rsi",
            "macd",
            "atr",
            "obv",
            "funding_rate",
            "implied_volatility",
            "put_call_skew",
            "market_cap_tier",
            "supply_dilution_risk",
            "onchain_activity_trend",
            "smart_money_divergence",
            "regime_detector",
        },
        ev_floor=config.ev_floor_1d,
        profit_factor_floor=config.profit_factor_floor,
        max_drawdown_floor=config.max_drawdown_floor,
        deflated_sharpe_floor=config.deflated_sharpe_floor,
        expected_holding_bars=14,
    )

    return {"15m": p_15m, "1h": p_1h, "4h": p_4h, "1d": p_1d}
