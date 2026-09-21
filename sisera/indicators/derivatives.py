"""Derivatives market microstructure family. See SCOPE.md §5 — "the core edge this
bot has that a spot-only or generic-TA bot doesn't."

These don't share the technical family's `Indicator.compute(ohlcv) -> IndicatorResult`
shape (§2) — each needs a different, specific input (a ticker snapshot, an order
book, OI history joined with price history, a cross-venue reading). Rather than
force a one-size-fits-all signature before there's a second real family to learn
the right abstraction from, each indicator here is a plain function with the
inputs it actually needs, all returning the same `IndicatorResult` output shape.
Wiring these into a unified engine belongs to Scoring & Ranking (§7, build order
step 3), once there's an actual combiner to design the interface around.
"""

from __future__ import annotations

import math

import pandas as pd

from sisera.data.models import CrossVenueFundingRate, LiquidationEvent, LongShortRatio, OrderBook, Ticker
from sisera.indicators.base import IndicatorResult


def _clip(x: float) -> float:
    return max(-1.0, min(1.0, x))


def compute_funding_rate(ticker: Ticker, scale: float = 300.0) -> IndicatorResult:
    """Contrarian at extremes, not trend-following (§5): persistently high positive
    funding means the crowd is leaning long and paying for it — a bearish tilt."""
    score = _clip(math.tanh(-ticker.funding_rate * scale))
    return IndicatorResult(name="funding_rate", score=score, value=ticker.funding_rate)


def compute_long_short_ratio(ratio: LongShortRatio, scale: float = 4.0) -> IndicatorResult:
    """Same contrarian framing as funding rate (§5) — an extremely long-skewed
    crowd is a crowded trade, not a confirming one."""
    skew = ratio.buy_ratio - 0.5  # -0.5..0.5
    score = _clip(math.tanh(-skew * scale))
    return IndicatorResult(name="long_short_ratio", score=score, value=ratio.buy_ratio)


def compute_basis(ticker: Ticker, scale: float = 300.0) -> IndicatorResult:
    """Perp (mark) price vs. index price premium — how much leverage demand is
    currently priced into this pair (§5). Positive = perp trading above index."""
    basis_pct = (ticker.mark_price - ticker.index_price) / ticker.index_price
    return IndicatorResult(name="basis", score=_clip(math.tanh(basis_pct * scale)), value=basis_pct)


def compute_mark_index_divergence(ticker: Ticker, scale: float = 300.0) -> IndicatorResult:
    """Magnitude-only risk/dislocation flag (§5), not directional — persistent
    mark/index divergence signals funding pressure or thin book depth either way.

    This is a snapshot v1. A "persistent" (trend-aware) version needs cached
    ticker history over time, which lands once the scan-loop/orchestrator exists
    to build that cache — not invented here from a single API call.
    """
    divergence_pct = (ticker.mark_price - ticker.index_price) / ticker.index_price
    score = _clip(math.tanh(abs(divergence_pct) * scale))
    return IndicatorResult(name="mark_index_divergence", score=score, value=divergence_pct)


def compute_order_book_imbalance(book: OrderBook, levels: int = 10) -> IndicatorResult:
    """Bid/ask volume imbalance near mid-price (§5) — a genuine short-horizon
    microstructure signal, not a proxy like mcap/volume ratio."""
    bid_volume = sum(level.size for level in book.bids[:levels])
    ask_volume = sum(level.size for level in book.asks[:levels])
    total = bid_volume + ask_volume
    imbalance = (bid_volume - ask_volume) / total if total > 0 else 0.0
    return IndicatorResult(name="order_book_imbalance", score=_clip(imbalance), value=imbalance)


def compute_open_interest_trend(
    oi_history: pd.DataFrame, price_history: pd.Series, scale: float = 15.0
) -> IndicatorResult:
    """OI change joined with price direction (§5): confirming moves (OI and price
    agreeing) get amplified confidence; diverging moves (price moving without OI
    participation) get dampened, since they're "weaker, less durable" per the doc.
    Sign always follows price direction — OI only scales how much to trust it.
    """
    oi_start, oi_end = oi_history["open_interest"].iloc[0], oi_history["open_interest"].iloc[-1]
    price_start, price_end = price_history.iloc[0], price_history.iloc[-1]
    oi_pct_change = (oi_end / oi_start - 1) if oi_start > 0 else 0.0
    price_pct_change = (price_end / price_start - 1) if price_start > 0 else 0.0
    confirmation = 1.5 if oi_pct_change > 0 else 0.6
    score = _clip(math.tanh(price_pct_change * scale * confirmation))
    return IndicatorResult(name="open_interest_trend", score=score, value=oi_pct_change)


def compute_cross_venue_funding_divergence(
    bybit_ticker: Ticker, cross_venue: CrossVenueFundingRate, scale: float = 300.0
) -> IndicatorResult:
    """Distinguishes a Bybit-specific squeeze setup from genuinely market-wide
    positioning (§5) — the raw Bybit funding reading looks identical in both cases."""
    divergence = bybit_ticker.funding_rate - cross_venue.funding_rate
    score = _clip(math.tanh(divergence * scale))
    return IndicatorResult(name="cross_venue_funding_divergence", score=score, value=divergence)


def compute_liquidation_cascade(
    events: list[LiquidationEvent], notional_threshold: float = 500_000.0
) -> IndicatorResult:
    """Cluster of forced liquidations in a short window (§5, fed by
    `LiquidationStream` — see `sisera.data.liquidation_stream`): a genuinely rare,
    genuinely predictive signal most retail bots don't have access to at all.

    Deliberately magnitude-only, not directional: whether a cascade marks a
    capitulation bottom (long liquidations) or a squeeze accelerating an existing
    trend (short liquidations) can't be told from the liquidation feed alone — per
    §5, that's the regime detector's job, and it's explicitly sequenced after this
    in the build order, not invented here as a guess. `value` carries the signed
    net notional (positive = net short liquidations / forced buying, negative =
    net long liquidations / forced selling) so a regime detector can consume the
    direction once it exists, without this indicator overclaiming one now.
    """
    if not events:
        return IndicatorResult(name="liquidation_cascade", score=0.0, value=0.0)

    long_liquidation_notional = sum(e.notional for e in events if e.side == "Sell")
    short_liquidation_notional = sum(e.notional for e in events if e.side == "Buy")
    total_notional = long_liquidation_notional + short_liquidation_notional
    net_notional = short_liquidation_notional - long_liquidation_notional

    intensity = _clip(math.tanh(total_notional / notional_threshold))
    return IndicatorResult(name="liquidation_cascade", score=intensity, value=net_notional)
