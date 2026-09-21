from __future__ import annotations

import pandas as pd
import pytest

from sisera.data.models import LLMFundamentalAssessment
from sisera.indicators.engine import IndicatorEngine, MarketSnapshot
from sisera.indicators.llm_fundamental import compute_llm_fundamental_analysis


def _minimal_ohlcv() -> pd.DataFrame:
    return pd.DataFrame(
        {
            "open": [1.0, 1.0], "high": [1.0, 1.0], "low": [1.0, 1.0],
            "close": [1.0, 1.0], "volume": [1.0, 1.0],
        }
    )


def _assessment(**overrides) -> LLMFundamentalAssessment:
    defaults = {
        "symbol": "BTCUSDT",
        "score": 0.6,
        "confidence": 0.8,
        "reasoning": "Strong fundamentals.",
        "model": "test/model",
        "timestamp_ms": 1_000_000_000_000,
    }
    defaults.update(overrides)
    return LLMFundamentalAssessment(**defaults)


def test_score_is_weighted_by_confidence():
    result = compute_llm_fundamental_analysis(_assessment(score=0.6, confidence=0.8))
    assert result.score == pytest.approx(0.48)


def test_low_confidence_pulls_score_toward_neutral():
    result = compute_llm_fundamental_analysis(_assessment(score=0.9, confidence=0.1))
    assert result.score == pytest.approx(0.09)


def test_raw_score_preserved_in_value_field():
    result = compute_llm_fundamental_analysis(_assessment(score=0.6, confidence=0.8))
    assert result.value == 0.6


def test_reliability_reflects_model_confidence():
    result = compute_llm_fundamental_analysis(_assessment(confidence=0.35))
    assert result.reliability == 0.35


def test_bearish_score_stays_negative_after_weighting():
    result = compute_llm_fundamental_analysis(_assessment(score=-0.7, confidence=0.5))
    assert result.score == pytest.approx(-0.35)


def test_indicator_name_is_stable():
    result = compute_llm_fundamental_analysis(_assessment())
    assert result.name == "llm_fundamental_analysis"


class TestEngineWiring:
    def test_included_in_snapshot_results_when_assessment_present(self):
        snap = MarketSnapshot(
            symbol="BTCUSDT", timeframe="1h", ohlcv=_minimal_ohlcv(), llm_fundamental=_assessment(),
        )
        output = IndicatorEngine().compute_snapshot(snap)
        names = [r.name for r in output.results]
        assert "llm_fundamental_analysis" in names

    def test_absent_from_results_when_no_assessment(self):
        snap = MarketSnapshot(symbol="BTCUSDT", timeframe="1h", ohlcv=_minimal_ohlcv())
        output = IndicatorEngine().compute_snapshot(snap)
        names = [r.name for r in output.results]
        assert "llm_fundamental_analysis" not in names

    def test_excluded_when_pruned_even_with_assessment_present(self):
        snap = MarketSnapshot(
            symbol="BTCUSDT", timeframe="1h", ohlcv=_minimal_ohlcv(), llm_fundamental=_assessment(),
        )
        engine = IndicatorEngine(pruned_indicator_names={"llm_fundamental_analysis"})
        output = engine.compute_snapshot(snap)
        names = [r.name for r in output.results]
        assert "llm_fundamental_analysis" not in names
