from __future__ import annotations

import numpy as np
import pandas as pd

from sisera.indicators.base import IndicatorResult
from sisera.indicators.engine import IndicatorEngine


def _ohlcv(n: int) -> pd.DataFrame:
    closes = 100 + np.cumsum(np.random.default_rng(1).normal(0, 1, n))
    index = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    return pd.DataFrame(
        {
            "open": closes,
            "high": closes * 1.001,
            "low": closes * 0.999,
            "close": closes,
            "volume": [1000.0] * n,
        },
        index=index,
    )


class _FixedIndicator:
    name = "fixed"
    min_periods = 5

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult:
        return IndicatorResult(name=self.name, score=0.5, value=1.0)


class _NeedsLotsOfHistory:
    name = "needs_lots"
    min_periods = 10_000

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult:  # pragma: no cover - never called
        raise AssertionError("should never be called — insufficient history")


class _BrokenIndicator:
    name = "broken"
    min_periods = 1

    def compute(self, ohlcv: pd.DataFrame) -> IndicatorResult:
        raise RuntimeError("boom")


def test_runs_all_indicators_that_have_enough_data():
    engine = IndicatorEngine([_FixedIndicator()])
    results = engine.compute_all(_ohlcv(20))
    assert len(results) == 1
    assert results[0].name == "fixed"


def test_skips_indicator_without_enough_history():
    engine = IndicatorEngine([_FixedIndicator(), _NeedsLotsOfHistory()])
    results = engine.compute_all(_ohlcv(20))
    assert [r.name for r in results] == ["fixed"]


def test_one_broken_indicator_does_not_prevent_others_from_running():
    engine = IndicatorEngine([_FixedIndicator(), _BrokenIndicator()])
    results = engine.compute_all(_ohlcv(20))
    assert [r.name for r in results] == ["fixed"]


def test_default_engine_runs_full_technical_set_on_sufficient_history():
    engine = IndicatorEngine()
    results = engine.compute_all(_ohlcv(150))
    names = {r.name for r in results}
    assert names == {"ema_crossover", "rsi", "macd", "atr", "bollinger_band_width", "obv"}
