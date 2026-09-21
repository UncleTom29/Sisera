from __future__ import annotations

import pandas as pd
import pytest

from sisera.data.models import NewsAssessment
from sisera.indicators.engine import IndicatorEngine, MarketSnapshot
from sisera.indicators.news_sentiment import compute_news_sentiment


def _assessment(**overrides) -> NewsAssessment:
    defaults = {
        "symbol": "BTCUSDT",
        "news_item_id": "item-1",
        "score": -0.7,
        "urgency": 0.8,
        "confidence": 0.6,
        "reasoning": "Test reasoning.",
        "model": "test/model",
        "timestamp_ms": 1_000_000_000_000,
    }
    defaults.update(overrides)
    return NewsAssessment(**defaults)


def _minimal_ohlcv() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "open": [1.0, 1.0], "high": [1.0, 1.0], "low": [1.0, 1.0],
            "close": [1.0, 1.0], "volume": [1.0, 1.0],
        }
    )


def test_score_is_weighted_by_confidence():
    result = compute_news_sentiment(_assessment(score=-0.7, confidence=0.6))
    assert result.score == pytest.approx(-0.42)


def test_low_confidence_pulls_score_toward_neutral():
    result = compute_news_sentiment(_assessment(score=-0.9, confidence=0.1))
    assert result.score == pytest.approx(-0.09)


def test_raw_score_preserved_in_value_field():
    result = compute_news_sentiment(_assessment(score=-0.7))
    assert result.value == -0.7


def test_reliability_reflects_confidence_not_urgency():
    result = compute_news_sentiment(_assessment(confidence=0.35, urgency=0.95))
    assert result.reliability == 0.35


def test_indicator_name_is_stable():
    result = compute_news_sentiment(_assessment())
    assert result.name == "news_sentiment"


class TestEngineWiring:
    def test_included_when_assessment_present(self):
        snap = MarketSnapshot(
            symbol="BTCUSDT", timeframe="1h", ohlcv=_minimal_ohlcv(), news_assessment=_assessment(),
        )
        output = IndicatorEngine().compute_snapshot(snap)
        assert "news_sentiment" in [r.name for r in output.results]

    def test_absent_without_assessment(self):
        snap = MarketSnapshot(symbol="BTCUSDT", timeframe="1h", ohlcv=_minimal_ohlcv())
        output = IndicatorEngine().compute_snapshot(snap)
        assert "news_sentiment" not in [r.name for r in output.results]

    def test_excluded_when_pruned(self):
        snap = MarketSnapshot(
            symbol="BTCUSDT", timeframe="1h", ohlcv=_minimal_ohlcv(), news_assessment=_assessment(),
        )
        engine = IndicatorEngine(pruned_indicator_names={"news_sentiment"})
        output = engine.compute_snapshot(snap)
        assert "news_sentiment" not in [r.name for r in output.results]
