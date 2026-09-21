from __future__ import annotations

import numpy as np
import pandas as pd
import pytest

from sisera.indicators.technical import (
    ATRIndicator,
    BollingerBandWidthIndicator,
    EMACrossoverIndicator,
    MACDIndicator,
    OBVIndicator,
    RSIIndicator,
)


def _ohlcv(closes: list[float], volumes: list[float] | None = None) -> pd.DataFrame:
    closes = np.array(closes, dtype=float)
    volumes = np.array(volumes if volumes is not None else [1000.0] * len(closes))
    highs = closes * 1.001
    lows = closes * 0.999
    opens = np.roll(closes, 1)
    opens[0] = closes[0]
    index = pd.date_range("2026-01-01", periods=len(closes), freq="h", tz="UTC")
    return pd.DataFrame(
        {"open": opens, "high": highs, "low": lows, "close": closes, "volume": volumes},
        index=index,
    )


def _trending(start: float, step: float, n: int) -> pd.DataFrame:
    return _ohlcv([start + step * i for i in range(n)])


def _flat(price: float, n: int) -> pd.DataFrame:
    return _ohlcv([price] * n)


def _flat_no_intrabar_range(price: float, n: int) -> pd.DataFrame:
    """Truly flat: open=high=low=close, unlike `_flat` which still gives each bar a
    small high/low spread. Needed for genuine zero-true-range ATR edge cases."""
    index = pd.date_range("2026-01-01", periods=n, freq="h", tz="UTC")
    return pd.DataFrame(
        {"open": price, "high": price, "low": price, "close": price, "volume": 1000.0},
        index=index,
    )


class TestEMACrossover:
    def test_uptrend_gives_positive_score(self):
        result = EMACrossoverIndicator().compute(_trending(100, 1.0, 60))
        assert result.score > 0

    def test_downtrend_gives_negative_score(self):
        result = EMACrossoverIndicator().compute(_trending(200, -1.0, 60))
        assert result.score < 0

    def test_flat_gives_near_zero_score(self):
        result = EMACrossoverIndicator().compute(_flat(100, 60))
        assert abs(result.score) < 0.01

    def test_score_always_bounded(self):
        result = EMACrossoverIndicator().compute(_trending(1, 50, 60))  # extreme trend
        assert -1.0 <= result.score <= 1.0


class TestRSI:
    def test_sustained_uptrend_is_overbought(self):
        result = RSIIndicator().compute(_trending(100, 2.0, 30))
        assert result.value > 70
        assert result.score > 0.4

    def test_sustained_downtrend_is_oversold(self):
        result = RSIIndicator().compute(_trending(300, -2.0, 30))
        assert result.value < 30
        assert result.score < -0.4

    def test_no_movement_is_neutral(self):
        result = RSIIndicator().compute(_flat(100, 30))
        assert result.value == 50.0
        assert result.score == 0.0

    def test_value_stays_within_0_100(self):
        result = RSIIndicator().compute(_trending(100, 5.0, 30))
        assert 0 <= result.value <= 100


class TestMACD:
    def test_uptrend_gives_positive_histogram(self):
        result = MACDIndicator().compute(_trending(100, 1.0, 60))
        assert result.score > 0

    def test_downtrend_gives_negative_histogram(self):
        result = MACDIndicator().compute(_trending(200, -1.0, 60))
        assert result.score < 0


class TestATR:
    def test_recent_volatility_spike_scores_positive(self):
        rng = np.random.default_rng(42)
        calm = 100 + rng.normal(0, 0.1, 80)
        volatile = 100 + rng.normal(0, 5.0, 20)
        closes = list(calm) + list(volatile)
        result = ATRIndicator(baseline_window=80).compute(_ohlcv(closes))
        assert result.score > 0

    def test_constant_price_gives_zero_atr_and_zero_score(self):
        result = ATRIndicator().compute(_flat_no_intrabar_range(100, 80))
        assert result.value == 0.0
        assert result.score == 0.0

    def test_flat_close_with_intrabar_range_gives_small_stable_atr(self):
        # `_flat`'s synthetic high/low still gives each bar a ~0.2%-of-price true
        # range even though closes don't move — ATR should reflect that (nonzero),
        # while the score stays ~0 since the level is stable, not "elevated" vs. baseline.
        result = ATRIndicator().compute(_flat(100, 80))
        assert result.value == pytest.approx(0.2, abs=0.01)
        assert abs(result.score) < 0.01

    def test_value_is_positive_when_price_moves(self):
        result = ATRIndicator().compute(_trending(100, 1.0, 80))
        assert result.value > 0


class TestBollingerBandWidth:
    def test_recent_expansion_scores_positive(self):
        rng = np.random.default_rng(7)
        calm = 100 + rng.normal(0, 0.1, 80)
        volatile = 100 + rng.normal(0, 5.0, 20)
        closes = list(calm) + list(volatile)
        result = BollingerBandWidthIndicator(baseline_window=80).compute(_ohlcv(closes))
        assert result.score > 0

    def test_flat_price_gives_zero_width(self):
        result = BollingerBandWidthIndicator().compute(_flat(100, 80))
        assert result.value == 0.0


class TestOBV:
    def test_rising_price_and_volume_gives_positive_score(self):
        n = 40
        closes = [100 + i for i in range(n)]
        volumes = [1000 + i * 50 for i in range(n)]  # volume increasing alongside price
        result = OBVIndicator().compute(_ohlcv(closes, volumes))
        assert result.score > 0

    def test_falling_price_gives_negative_score(self):
        n = 40
        closes = [200 - i for i in range(n)]
        result = OBVIndicator().compute(_ohlcv(closes))
        assert result.score < 0

    def test_score_always_bounded(self):
        result = OBVIndicator().compute(_trending(1, 100, 40))
        assert -1.0 <= result.score <= 1.0


def test_all_indicators_produce_finite_bounded_scores_on_realistic_random_walk():
    rng = np.random.default_rng(123)
    steps = rng.normal(0, 1, 120)
    closes = 100 + np.cumsum(steps)
    ohlcv = _ohlcv(list(closes))

    from sisera.indicators.technical import default_technical_indicators

    for indicator in default_technical_indicators():
        result = indicator.compute(ohlcv)
        assert np.isfinite(result.score), f"{indicator.name} produced a non-finite score"
        assert -1.0 <= result.score <= 1.0, f"{indicator.name} score out of bounds: {result.score}"
        assert np.isfinite(result.value), f"{indicator.name} produced a non-finite value"
