"""Options-derived family, BTC/ETH only. See SCOPE.md §5.

Forward-looking, unlike everything in the technical family (ATR, Bollinger) which
is backward-looking/realized. Scoped to 2 of 200 pairs since that's where liquid
options markets exist — zero-weighted elsewhere, same fallback-tier mechanism as
thin on-chain data (§3).
"""

from __future__ import annotations

import math

from sisera.data.models import DeribitOptionTicker
from sisera.indicators.base import IndicatorResult


def _clip(x: float) -> float:
    return max(-1.0, min(1.0, x))


def compute_implied_volatility(dvol: float, baseline: float | None = None) -> IndicatorResult:
    """DVOL level (§5) — informs §9's stop-distance sizing: widen ATR-based stops
    on BTC/ETH when forward IV is elevated, before realized volatility (and
    therefore ATR) has caught up. Score is "elevated vs. own baseline," same
    pattern as ATR/Bollinger — needs a baseline to score against; without one
    (no cached DVOL history yet) this reports level only with a neutral score.
    """
    if baseline is not None and baseline > 0:
        score = _clip(math.tanh((dvol - baseline) / baseline))
    else:
        score = 0.0
    return IndicatorResult(name="implied_volatility", score=score, value=dvol)


def compute_put_call_skew(
    tickers: list[DeribitOptionTicker], target_delta: float = 0.25, scale: float = 20.0
) -> IndicatorResult:
    """~25-delta put/call IV skew (§5): rising put skew signals hedging/fear
    building even while price holds up; rising call skew signals speculative
    positioning building. Positive score = put-skewed (bearish/fear lean).

    `delta` sign identifies put vs. call directly (calls positive, puts negative)
    — no separate option_type field needed on the ticker for this. Picks the
    strike closest to the target delta on each side from whatever candidates were
    already fetched (see `DeribitClient.get_near_money_option_tickers`).
    """
    calls = [t for t in tickers if t.delta > 0]
    puts = [t for t in tickers if t.delta < 0]
    if not calls or not puts:
        return IndicatorResult(name="put_call_skew", score=0.0, value=0.0)

    closest_call = min(calls, key=lambda t: abs(t.delta - target_delta))
    closest_put = min(puts, key=lambda t: abs(abs(t.delta) - target_delta))

    skew = closest_put.mark_iv - closest_call.mark_iv
    return IndicatorResult(name="put_call_skew", score=_clip(math.tanh(skew / scale)), value=skew)
