"""Composite / custom indicators and regime detector family. See SCOPE.md §5.

Combines raw signals across technical, derivatives, and liquidity domains into
higher-order signals:
- Smart-money divergence (price vs. funding vs. OI vs. cascades)
- Liquidity-adjusted momentum (scales momentum by orderbook / volume depth)
- Regime detector: classifies regime (TRENDING vs MEAN_REVERTING), liquidation cascade
  nature (CAPITULATION vs SQUEEZE), and regime stability (STABLE, TRANSITIONING, UNKNOWN).
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from enum import StrEnum

import numpy as np
import pandas as pd

from sisera.data.models import CoinMarketData, OrderBook
from sisera.indicators.base import IndicatorResult


def _clip(x: float) -> float:
    return max(-1.0, min(1.0, x))


class RegimeType(StrEnum):
    TRENDING = "TRENDING"
    MEAN_REVERTING = "MEAN_REVERTING"
    CHOP = "CHOP"


class CascadeRegime(StrEnum):
    CAPITULATION = "CAPITULATION"  # Fade it (reversal setup)
    SQUEEZE = "SQUEEZE"  # Ride it (trend acceleration)
    NONE = "NONE"


class StabilityState(StrEnum):
    STABLE = "STABLE"
    TRANSITIONING = "TRANSITIONING"
    UNKNOWN = "UNKNOWN"


@dataclass(frozen=True)
class RegimeState:
    """Quantitative regime state output by the RegimeDetector."""

    regime_type: RegimeType
    stability: StabilityState
    stability_score: float  # 0.0 to 1.0
    cascade_regime: CascadeRegime
    adx_value: float
    hurst_estimate: float
    volatility_ratio: float


def compute_smart_money_divergence(
    price_pct_change: float,
    funding_rate: float,
    oi_pct_change: float,
    short_liq_notional: float = 0.0,
    long_liq_notional: float = 0.0,
) -> IndicatorResult:
    """Evaluates whether price movement is backed by organic accumulation or crowded late positioning.

    See SCOPE.md §5:
    - Price rising + funding flat/negative + OI rising = accumulation without crowding
      (bullish, +score).
    - Price rising + funding spike + short liquidations clustered = crowded late move / squeeze
      blowoff (bearish tilt, -score).
    - Price falling + funding high positive = trapped longs / liquidation risk (bearish, -score).
    - Price falling + funding negative + long liquidations clustered = capitulation bottom
      candidate (bullish tilt, +score).
    """
    score = 0.0

    # Funding tilt: negative funding when price rises is contrarian bullish accumulation
    funding_drag = funding_rate * 400.0  # e.g. 0.01% -> 0.04
    oi_factor = math.tanh(oi_pct_change * 5.0)

    if price_pct_change > 0:
        if funding_rate <= 0 and oi_pct_change > 0:
            # Clean spot/perp accumulation without crowd leverage
            score = 0.6 + 0.4 * oi_factor
        elif funding_rate > 0.0003 and short_liq_notional > long_liq_notional * 2:
            # Crowded short squeeze / late blowoff
            score = -0.4 - min(0.5, funding_drag)
        else:
            # Normal trending with moderate funding
            score = _clip(0.4 * (1.0 - funding_drag) + 0.3 * oi_factor)
    elif price_pct_change < 0:
        if funding_rate > 0.0002 and oi_pct_change > 0:
            # Trapped longs adding to losers
            score = -0.7
        elif funding_rate < -0.0002 and long_liq_notional > short_liq_notional * 2:
            # Capitulation cascade in progress
            score = 0.5
        else:
            score = _clip(-0.4 - 0.3 * oi_factor)

    return IndicatorResult(name="smart_money_divergence", score=_clip(score), value=score)


def compute_liquidity_adjusted_momentum(
    raw_momentum_score: float,
    order_book: OrderBook | None = None,
    market_data: CoinMarketData | None = None,
    intended_notional: float = 10_000.0,
) -> IndicatorResult:
    """Scales raw momentum down for illiquid pairs where trading at size incurs high slippage.

    See SCOPE.md §5, §7.
    """
    liquidity_factor = 1.0

    if order_book and order_book.bids and order_book.asks:
        # Calculate available depth within 1% of mid-price
        mid = order_book.mid_price or 1.0
        bid_depth = sum(lvl.size * lvl.price for lvl in order_book.bids if lvl.price >= mid * 0.99)
        ask_depth = sum(lvl.size * lvl.price for lvl in order_book.asks if lvl.price <= mid * 1.01)
        total_near_depth = bid_depth + ask_depth

        if total_near_depth > 0:
            # Full factor if depth >= 2x intended size
            ratio = total_near_depth / max(intended_notional * 2.0, 1.0)
            liquidity_factor = min(1.0, max(0.15, math.sqrt(ratio)))
    elif market_data and market_data.total_volume and market_data.market_cap:
        # Fallback to volume/mcap liquidity ratio
        vol_mcap_ratio = market_data.total_volume / max(market_data.market_cap, 1.0)
        liquidity_factor = min(1.0, max(0.2, math.tanh(vol_mcap_ratio * 10.0)))

    adjusted_score = _clip(raw_momentum_score * liquidity_factor)
    return IndicatorResult(
        name="liquidity_adjusted_momentum",
        score=adjusted_score,
        value=raw_momentum_score,
        reliability=liquidity_factor,
    )


def estimate_hurst_exponent(series: pd.Series, max_lag: int = 20) -> float:
    """Estimates Hurst exponent via variance of differences: Var(X(t+tau) - X(t)) ~ tau^(2H).

    H < 0.45: Mean-reverting (anti-persistent)
    H ~ 0.50: Geometric random walk
    H > 0.55: Persistent (trending)
    """
    if len(series) < max_lag * 2 or series.std() < 1e-9:
        return 0.5

    lags = [lag_val for lag_val in range(2, max_lag + 1) if lag_val <= len(series) // 3]
    if len(lags) < 3:
        return 0.5

    tau_values = []
    rms_values = []
    for lag in lags:
        diffs = series.diff(lag).dropna()
        rms = float(np.sqrt(np.mean(diffs.values**2)))
        if rms > 1e-9:
            tau_values.append(math.log(lag))
            rms_values.append(math.log(rms))

    if len(tau_values) < 2:
        return 0.5

    x = np.array(tau_values)
    y = np.array(rms_values)
    slope, _ = np.polyfit(x, y, 1)
    return float(np.clip(slope, 0.05, 0.95))


def compute_regime_detector(
    ohlcv: pd.DataFrame,
    adx_threshold: float = 25.0,
    recent_liq_notional_net: float = 0.0,
    liq_cluster_detected: bool = False,
) -> tuple[IndicatorResult, RegimeState]:
    """Classifies pair/timeframe regime, transition stability, and cascade type.

    See SCOPE.md §5:
    - Trending (ADX > 25, Hurst > 0.55) vs Mean-reverting (ADX < 20, Hurst < 0.48).
    - Transition awareness: STABLE vs TRANSITIONING vs UNKNOWN with quantitative stability score.
    - Cascade interpretation: CAPITULATION (fade) vs SQUEEZE (ride).
    """
    if len(ohlcv) < 30:
        state = RegimeState(
            regime_type=RegimeType.CHOP,
            stability=StabilityState.UNKNOWN,
            stability_score=0.3,
            cascade_regime=CascadeRegime.NONE,
            adx_value=15.0,
            hurst_estimate=0.5,
            volatility_ratio=1.0,
        )
        return IndicatorResult(name="regime_detector", score=0.0, value=15.0), state

    close = ohlcv["close"]
    high = ohlcv["high"]
    low = ohlcv["low"]

    # Wilder's ADX calculation
    prev_close = close.shift(1)
    tr = pd.concat([high - low, (high - prev_close).abs(), (low - prev_close).abs()], axis=1).max(axis=1)
    atr14 = tr.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()

    up_move = high - high.shift(1)
    down_move = low.shift(1) - low
    plus_dm = np.where((up_move > down_move) & (up_move > 0), up_move, 0.0)
    minus_dm = np.where((down_move > up_move) & (down_move > 0), down_move, 0.0)

    plus_di = (
        100
        * pd.Series(plus_dm, index=ohlcv.index).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
        / atr14
    )
    minus_di = (
        100
        * pd.Series(minus_dm, index=ohlcv.index).ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
        / atr14
    )

    dx = 100 * (plus_di - minus_di).abs() / (plus_di + minus_di + 1e-9)
    adx_series = dx.ewm(alpha=1 / 14, adjust=False, min_periods=14).mean()
    adx = float(adx_series.iloc[-1]) if not pd.isna(adx_series.iloc[-1]) else 20.0

    # Hurst exponent on recent closes
    hurst = estimate_hurst_exponent(close.tail(60))

    # Volatility ratio: short-term ATR vs longer-term baseline
    short_vol = atr14.iloc[-1]
    long_vol = atr14.tail(50).mean()
    vol_ratio = float(short_vol / long_vol) if long_vol > 0 else 1.0

    # Regime classification
    if adx >= adx_threshold or hurst > 0.55:
        regime_type = RegimeType.TRENDING
        regime_score = min(1.0, (adx - 20.0) / 30.0)
    elif adx < 20.0 and hurst < 0.48:
        regime_type = RegimeType.MEAN_REVERTING
        regime_score = -min(1.0, (20.0 - adx) / 20.0)
    else:
        regime_type = RegimeType.CHOP
        regime_score = 0.0

    # Stability assessment: check if ADX slope is consistent and vol is not violently spiking
    adx_slope = adx_series.diff(5).iloc[-1] if len(adx_series) >= 5 else 0.0
    is_trans = False
    stability_score = 0.8

    if vol_ratio > 1.8 or (abs(adx_slope) > 8.0 and adx < 28.0):
        # Volatility expansion during weak trend = potential breakout / regime shift
        is_trans = True
        stability_score = max(0.2, 0.8 - (vol_ratio - 1.0) * 0.4)

    stability = StabilityState.TRANSITIONING if is_trans else StabilityState.STABLE

    # Cascade regime classification
    cascade_regime = CascadeRegime.NONE
    if liq_cluster_detected:
        if recent_liq_notional_net < 0:  # Longs forced liquidated
            cascade_regime = (
                CascadeRegime.CAPITULATION
                if regime_type == RegimeType.MEAN_REVERTING
                else CascadeRegime.SQUEEZE
            )
        elif recent_liq_notional_net > 0:  # Shorts forced liquidated
            cascade_regime = (
                CascadeRegime.CAPITULATION
                if regime_type == RegimeType.MEAN_REVERTING
                else CascadeRegime.SQUEEZE
            )

    state = RegimeState(
        regime_type=regime_type,
        stability=stability,
        stability_score=stability_score,
        cascade_regime=cascade_regime,
        adx_value=adx,
        hurst_estimate=hurst,
        volatility_ratio=vol_ratio,
    )

    return (
        IndicatorResult(
            name="regime_detector",
            score=_clip(regime_score),
            value=adx,
            reliability=stability_score,
        ),
        state,
    )
