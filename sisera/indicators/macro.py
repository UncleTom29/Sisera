"""Macro-regime indicator — event-intelligence layer. See SCOPE.md §5.

First-cut heuristic, NOT empirically calibrated — same honesty as fundamental.py's
mcap_volume_ratio placeholder constant. Combines up to four independent macro sub-signals
(Fed funds rate direction, 10Y Treasury yield direction, CPI level vs. the Fed's ~2%
target, aggregate DeFi TVL direction) into one risk-on/risk-off read. Each sub-signal is
optional -- a missing FRED key or a failed DeFiLlama call just drops that piece rather than
blocking the whole indicator; `reliability` reflects how many of the four were actually
available this cycle.

Deliberately does NOT attempt the event-intelligence proposal's full per-asset sensitivity
graph (e.g. "BTC -0.28, ETH -0.41, SOL -0.67" for a given event type) -- those numbers
would be fabricated precision with nothing behind them yet. This is a single BTC-anchored
market-wide composite; a real per-category, per-asset sensitivity map is something
sisera/scoring/event_attribution.py could eventually learn from settled outcomes, not
something to hardcode here.
"""

from __future__ import annotations

import math

from sisera.data.models import MacroSnapshot
from sisera.indicators.base import IndicatorResult

_FED_FUNDS_TARGET_MOVE_PCT = 0.5  # a 0.5pt move in a month is a large, saturating signal
_YIELD_TARGET_MOVE_PCT = 1.0  # 10Y yields move more than Fed funds in a given month
_CPI_TARGET_PCT = 2.0  # the Fed's long-run inflation target
_CPI_SCALE_PCT = 3.0
_TVL_TARGET_MOVE_PCT = 5.0  # a 5% week-over-week aggregate TVL move is a large signal


def _clip(x: float) -> float:
    return max(-1.0, min(1.0, x))


def compute_macro_regime(snapshot: MacroSnapshot) -> IndicatorResult:
    """Risk-on/risk-off composite: falling rates/yields, benign CPI, and rising TVL score
    bullish (risk-on); the inverse scores bearish (risk-off). `value` is the count of
    sub-signals actually available this cycle (0..4), the most honest "raw number" a
    four-way composite like this has that isn't just a restatement of `score`.
    """
    sub_scores: list[float] = []

    if snapshot.fed_funds_rate is not None and snapshot.fed_funds_rate_1m_ago is not None:
        delta = snapshot.fed_funds_rate - snapshot.fed_funds_rate_1m_ago
        sub_scores.append(-math.tanh(delta / _FED_FUNDS_TARGET_MOVE_PCT))

    if snapshot.treasury_10y_yield is not None and snapshot.treasury_10y_yield_1m_ago is not None:
        delta = snapshot.treasury_10y_yield - snapshot.treasury_10y_yield_1m_ago
        sub_scores.append(-math.tanh(delta / _YIELD_TARGET_MOVE_PCT))

    if snapshot.cpi_yoy_pct is not None:
        sub_scores.append(-math.tanh((snapshot.cpi_yoy_pct - _CPI_TARGET_PCT) / _CPI_SCALE_PCT))

    if (
        snapshot.aggregate_tvl_usd is not None
        and snapshot.aggregate_tvl_7d_ago_usd is not None
        and snapshot.aggregate_tvl_7d_ago_usd > 0
    ):
        pct_change = (
            (snapshot.aggregate_tvl_usd - snapshot.aggregate_tvl_7d_ago_usd)
            / snapshot.aggregate_tvl_7d_ago_usd
            * 100.0
        )
        sub_scores.append(math.tanh(pct_change / _TVL_TARGET_MOVE_PCT))

    if not sub_scores:
        return IndicatorResult(name="macro_regime", score=0.0, value=0.0, reliability=0.0)

    score = _clip(sum(sub_scores) / len(sub_scores))
    reliability = len(sub_scores) / 4.0
    return IndicatorResult(
        name="macro_regime", score=score, value=float(len(sub_scores)), reliability=reliability
    )
