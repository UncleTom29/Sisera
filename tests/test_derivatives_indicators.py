from __future__ import annotations

import pandas as pd
import pytest

from sisera.data.models import (
    CrossVenueFundingRate,
    LiquidationEvent,
    LongShortRatio,
    OrderBook,
    OrderBookLevel,
    Ticker,
)
from sisera.indicators.derivatives import (
    compute_basis,
    compute_cross_venue_funding_divergence,
    compute_funding_rate,
    compute_liquidation_cascade,
    compute_long_short_ratio,
    compute_mark_index_divergence,
    compute_open_interest_trend,
    compute_order_book_imbalance,
)


def _ticker(**overrides) -> Ticker:
    defaults = {
        "symbol": "BTCUSDT",
        "last_price": 50000.0,
        "mark_price": 50000.0,
        "index_price": 50000.0,
        "funding_rate": 0.0,
        "open_interest": 1000.0,
        "bid_price": 49999.0,
        "ask_price": 50001.0,
    }
    defaults.update(overrides)
    return Ticker(**defaults)


class TestFundingRate:
    def test_high_positive_funding_is_bearish_contrarian(self):
        result = compute_funding_rate(_ticker(funding_rate=0.002))
        assert result.score < 0

    def test_high_negative_funding_is_bullish_contrarian(self):
        result = compute_funding_rate(_ticker(funding_rate=-0.002))
        assert result.score > 0

    def test_zero_funding_is_neutral(self):
        result = compute_funding_rate(_ticker(funding_rate=0.0))
        assert result.score == 0.0


class TestLongShortRatio:
    def test_crowd_very_long_is_bearish_contrarian(self):
        result = compute_long_short_ratio(
            LongShortRatio(symbol="BTCUSDT", buy_ratio=0.85, sell_ratio=0.15, timestamp_ms=1)
        )
        assert result.score < 0

    def test_crowd_very_short_is_bullish_contrarian(self):
        result = compute_long_short_ratio(
            LongShortRatio(symbol="BTCUSDT", buy_ratio=0.15, sell_ratio=0.85, timestamp_ms=1)
        )
        assert result.score > 0

    def test_balanced_crowd_is_neutral(self):
        result = compute_long_short_ratio(
            LongShortRatio(symbol="BTCUSDT", buy_ratio=0.5, sell_ratio=0.5, timestamp_ms=1)
        )
        assert result.score == 0.0


class TestBasis:
    def test_perp_premium_is_positive(self):
        result = compute_basis(_ticker(mark_price=50100, index_price=50000))
        assert result.score > 0
        assert result.value == pytest.approx(0.002)

    def test_perp_discount_is_negative(self):
        result = compute_basis(_ticker(mark_price=49900, index_price=50000))
        assert result.score < 0

    def test_at_parity_is_zero(self):
        result = compute_basis(_ticker(mark_price=50000, index_price=50000))
        assert result.score == 0.0


class TestMarkIndexDivergence:
    def test_magnitude_only_same_score_regardless_of_direction(self):
        premium = compute_mark_index_divergence(_ticker(mark_price=50100, index_price=50000))
        discount = compute_mark_index_divergence(_ticker(mark_price=49900, index_price=50000))
        assert premium.score == pytest.approx(discount.score, rel=1e-3)
        assert premium.score > 0  # magnitude, not direction — always non-negative

    def test_signed_value_still_carries_direction(self):
        premium = compute_mark_index_divergence(_ticker(mark_price=50100, index_price=50000))
        discount = compute_mark_index_divergence(_ticker(mark_price=49900, index_price=50000))
        assert premium.value > 0
        assert discount.value < 0

    def test_at_parity_is_zero(self):
        result = compute_mark_index_divergence(_ticker(mark_price=50000, index_price=50000))
        assert result.score == 0.0


class TestOrderBookImbalance:
    def _book(self, bid_sizes: list[float], ask_sizes: list[float]) -> OrderBook:
        return OrderBook(
            symbol="BTCUSDT",
            bids=[OrderBookLevel(price=100 - i, size=s) for i, s in enumerate(bid_sizes)],
            asks=[OrderBookLevel(price=101 + i, size=s) for i, s in enumerate(ask_sizes)],
            timestamp_ms=1,
        )

    def test_more_bid_volume_is_positive(self):
        result = compute_order_book_imbalance(self._book([10, 10], [2, 2]))
        assert result.score > 0

    def test_more_ask_volume_is_negative(self):
        result = compute_order_book_imbalance(self._book([2, 2], [10, 10]))
        assert result.score < 0

    def test_balanced_book_is_neutral(self):
        result = compute_order_book_imbalance(self._book([5, 5], [5, 5]))
        assert result.score == 0.0

    def test_empty_book_is_neutral_not_an_error(self):
        result = compute_order_book_imbalance(self._book([], []))
        assert result.score == 0.0

    def test_score_always_bounded(self):
        result = compute_order_book_imbalance(self._book([1000], [0.001]))
        assert -1.0 <= result.score <= 1.0


class TestOpenInterestTrend:
    def _oi(self, values: list[float]) -> pd.DataFrame:
        index = pd.date_range("2026-01-01", periods=len(values), freq="h", tz="UTC")
        return pd.DataFrame({"open_interest": values}, index=index)

    def _price(self, values: list[float]) -> pd.Series:
        index = pd.date_range("2026-01-01", periods=len(values), freq="h", tz="UTC")
        return pd.Series(values, index=index)

    def test_oi_up_price_up_is_strongly_bullish(self):
        result = compute_open_interest_trend(self._oi([1000, 1200]), self._price([100, 105]))
        assert result.score > 0

    def test_oi_up_price_down_is_strongly_bearish(self):
        result = compute_open_interest_trend(self._oi([1000, 1200]), self._price([100, 95]))
        assert result.score < 0

    def test_confirming_move_scores_larger_than_diverging_move_same_price_change(self):
        confirmed = compute_open_interest_trend(self._oi([1000, 1200]), self._price([100, 110]))
        diverging = compute_open_interest_trend(self._oi([1000, 800]), self._price([100, 110]))
        # both bullish (price up), but OI-backed is stronger
        assert confirmed.score > diverging.score > 0


class TestCrossVenueFundingDivergence:
    def test_bybit_funding_higher_than_cross_venue_scores_positive(self):
        bybit = _ticker(funding_rate=0.002)
        cross = CrossVenueFundingRate(
            exchange="binance", symbol="BTC/USDT:USDT", funding_rate=0.0001, timestamp_ms=1
        )
        result = compute_cross_venue_funding_divergence(bybit, cross)
        assert result.score > 0

    def test_matching_funding_rates_score_near_zero(self):
        bybit = _ticker(funding_rate=0.0001)
        cross = CrossVenueFundingRate(
            exchange="binance", symbol="BTC/USDT:USDT", funding_rate=0.0001, timestamp_ms=1
        )
        result = compute_cross_venue_funding_divergence(bybit, cross)
        assert result.score == 0.0


class TestLiquidationCascade:
    def _liq(self, side: str, price: float, size: float) -> LiquidationEvent:
        return LiquidationEvent(symbol="BTCUSDT", side=side, price=price, size=size, timestamp_ms=1)

    def test_no_events_is_neutral(self):
        result = compute_liquidation_cascade([])
        assert result.score == 0.0
        assert result.value == 0.0

    def test_small_cluster_gives_low_intensity(self):
        events = [self._liq("Sell", 50000, 0.01)]  # $500 notional, tiny vs. default $500k threshold
        result = compute_liquidation_cascade(events)
        assert 0 < result.score < 0.1

    def test_large_cluster_gives_high_intensity(self):
        events = [self._liq("Sell", 50000, 20) for _ in range(5)]  # $5M total notional
        result = compute_liquidation_cascade(events)
        assert result.score > 0.9

    def test_score_is_magnitude_only_regardless_of_side(self):
        long_liqs = [self._liq("Sell", 50000, 10)]
        short_liqs = [self._liq("Buy", 50000, 10)]
        long_score = compute_liquidation_cascade(long_liqs).score
        short_score = compute_liquidation_cascade(short_liqs).score
        assert long_score == short_score

    def test_value_is_negative_for_net_long_liquidations(self):
        events = [self._liq("Sell", 50000, 10)]  # forced selling = longs liquidated
        result = compute_liquidation_cascade(events)
        assert result.value < 0

    def test_value_is_positive_for_net_short_liquidations(self):
        events = [self._liq("Buy", 50000, 10)]  # forced buying = shorts liquidated
        result = compute_liquidation_cascade(events)
        assert result.value > 0

    def test_mixed_sides_partially_offset_in_value_but_not_in_intensity(self):
        events = [self._liq("Sell", 50000, 10), self._liq("Buy", 50000, 10)]
        result = compute_liquidation_cascade(events)
        assert result.value == 0.0  # net notional cancels out
        assert result.score > 0  # but total activity still registers as cascade intensity

    def test_score_always_bounded(self):
        events = [self._liq("Sell", 100000, 1000) for _ in range(50)]  # extreme notional
        result = compute_liquidation_cascade(events)
        assert -1.0 <= result.score <= 1.0
