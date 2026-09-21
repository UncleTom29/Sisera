from __future__ import annotations

import pandas as pd
import pytest

from sisera.data.models import CoinMarketData
from sisera.indicators.fundamental import (
    compute_market_cap_tier,
    compute_mcap_volume_ratio,
    compute_onchain_activity_trend,
    compute_supply_dilution_risk,
)


def _market_data(**overrides) -> CoinMarketData:
    defaults = {
        "id": "bitcoin",
        "symbol": "btc",
        "name": "Bitcoin",
        "market_cap": 1_000_000_000.0,
        "market_cap_rank": 1,
        "current_price": 50000.0,
        "total_volume": 50_000_000.0,
        "circulating_supply": 19_000_000.0,
        "total_supply": 19_000_000.0,
        "max_supply": 21_000_000.0,
    }
    defaults.update(overrides)
    return CoinMarketData(**defaults)


class TestMarketCapTier:
    def test_rank_1_scores_near_maximum(self):
        result = compute_market_cap_tier(_market_data(market_cap_rank=1))
        assert result.score == pytest.approx(1.0)

    def test_rank_200_scores_near_zero(self):
        result = compute_market_cap_tier(_market_data(market_cap_rank=200))
        assert result.score == pytest.approx(0.0, abs=0.01)

    def test_higher_rank_number_scores_lower(self):
        top = compute_market_cap_tier(_market_data(market_cap_rank=5))
        bottom = compute_market_cap_tier(_market_data(market_cap_rank=150))
        assert top.score > bottom.score

    def test_missing_rank_is_neutral_not_an_error(self):
        result = compute_market_cap_tier(_market_data(market_cap_rank=None))
        assert result.score == 0.0

    def test_score_always_bounded(self):
        result = compute_market_cap_tier(_market_data(market_cap_rank=1))
        assert 0.0 <= result.score <= 1.0


class TestMcapVolumeRatio:
    def test_thin_relative_volume_scores_higher_risk(self):
        thin = compute_mcap_volume_ratio(_market_data(market_cap=1_000_000_000, total_volume=1_000_000))
        thick = compute_mcap_volume_ratio(
            _market_data(market_cap=1_000_000_000, total_volume=200_000_000)
        )
        assert thin.score > thick.score

    def test_missing_volume_is_neutral_not_an_error(self):
        result = compute_mcap_volume_ratio(_market_data(total_volume=None))
        assert result.score == 0.0

    def test_zero_volume_is_neutral_not_a_division_error(self):
        result = compute_mcap_volume_ratio(_market_data(total_volume=0))
        assert result.score == 0.0


class TestSupplyDilutionRisk:
    def test_fully_circulating_supply_has_no_dilution_risk(self):
        result = compute_supply_dilution_risk(
            _market_data(circulating_supply=21_000_000, max_supply=21_000_000)
        )
        assert result.score == pytest.approx(0.0, abs=1e-6)

    def test_mostly_uncirculated_supply_has_high_dilution_risk(self):
        result = compute_supply_dilution_risk(
            _market_data(circulating_supply=1_000_000, max_supply=21_000_000)
        )
        assert result.score > 0.9

    def test_no_max_supply_is_neutral_not_an_error(self):
        result = compute_supply_dilution_risk(_market_data(max_supply=None))
        assert result.score == 0.0

    def test_score_always_bounded(self):
        result = compute_supply_dilution_risk(_market_data(circulating_supply=1, max_supply=21_000_000))
        assert 0.0 <= result.score <= 1.0


class TestOnchainActivityTrend:
    def _series(self, values: list[float]) -> pd.Series:
        index = pd.date_range("2026-01-01", periods=len(values), freq="D", tz="UTC")
        return pd.Series(values, index=index)

    def test_spike_above_baseline_scores_elevated(self):
        history = self._series([1_000_000] * 13 + [2_000_000])
        result = compute_onchain_activity_trend(history, baseline_window=14)
        assert result.score > 0.5

    def test_drop_below_baseline_also_scores_elevated_magnitude_only(self):
        history = self._series([1_000_000] * 13 + [200_000])
        result = compute_onchain_activity_trend(history, baseline_window=14)
        assert result.score > 0  # magnitude-only: direction isn't asserted either way

    def test_stable_activity_scores_near_zero(self):
        history = self._series([1_000_000] * 14)
        result = compute_onchain_activity_trend(history, baseline_window=14)
        assert result.score == pytest.approx(0.0, abs=0.01)

    def test_insufficient_history_is_neutral_not_an_error(self):
        result = compute_onchain_activity_trend(self._series([1_000_000]))
        assert result.score == 0.0

    def test_value_carries_the_current_level(self):
        history = self._series([1_000_000] * 13 + [1_500_000])
        result = compute_onchain_activity_trend(history)
        assert result.value == 1_500_000
