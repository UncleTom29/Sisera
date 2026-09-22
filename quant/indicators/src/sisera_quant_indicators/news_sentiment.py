"""Breaking-news sentiment indicator. See SCOPE.md §1, §5.

Live/paper-forward only -- see NOT_BACKTESTABLE_INDICATORS in sisera/backtest/engine.py.
Distinct from llm_fundamental_analysis: this reacts to one specific, timestamped news
event rather than periodically assessing overall project quality, and carries an `urgency`
dimension llm_fundamental_analysis doesn't need -- see sisera/scoring/news_relevance.py and
sisera/orchestrator.py for how urgency drives an expedited reaction rather than waiting for
the next normal scan cycle.
"""

from __future__ import annotations

from sisera.data.models import NewsAssessment
from sisera_quant_indicators.base import IndicatorResult


def compute_news_sentiment(assessment: NewsAssessment) -> IndicatorResult:
    """Directional, confidence-weighted like llm_fundamental_analysis -- a low-confidence
    read (e.g. an uncorroborated single-source claim, per the news-triage system prompt in
    sisera/data/openrouter.py) is pulled toward neutral rather than trusted at full
    magnitude. Urgency is not folded into the score itself; the caller uses it separately
    to decide whether this warrants an expedited reaction."""
    weighted_score = assessment.score * assessment.confidence
    return IndicatorResult(
        name="news_sentiment",
        score=max(-1.0, min(1.0, weighted_score)),
        value=assessment.score,
        reliability=assessment.confidence,
    )
