"""LLM-powered fundamental analysis indicator. See SCOPE.md §1, §5.

Live/paper-forward only -- see sisera/data/openrouter.py and NOT_BACKTESTABLE_INDICATORS
in sisera/backtest/engine.py for why this is never replayed against history. Real accuracy
is tracked forward over time by sisera/scoring/llm_track_record.py instead, feeding the
same IndicatorRelevancePruner every other indicator earns or loses trust through.
"""

from __future__ import annotations

from sisera.data.models import LLMFundamentalAssessment
from sisera.indicators.base import IndicatorResult


def compute_llm_fundamental_analysis(assessment: LLMFundamentalAssessment) -> IndicatorResult:
    """Directional, confidence-weighted: a low-confidence LLM read is down-weighted toward
    neutral rather than trusted at full magnitude, matching how `reliability` already
    down-weights thinly-computed indicators elsewhere (see IndicatorResult)."""
    weighted_score = assessment.score * assessment.confidence
    return IndicatorResult(
        name="llm_fundamental_analysis",
        score=max(-1.0, min(1.0, weighted_score)),
        value=assessment.score,
        reliability=assessment.confidence,
    )
