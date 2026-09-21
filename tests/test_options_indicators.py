from __future__ import annotations

from sisera.data.models import DeribitOptionTicker
from sisera.indicators.options import compute_implied_volatility, compute_put_call_skew


def _ticker(name: str, mark_iv: float, delta: float) -> DeribitOptionTicker:
    return DeribitOptionTicker(
        instrument_name=name, mark_iv=mark_iv, delta=delta, underlying_price=60000.0
    )


class TestImpliedVolatility:
    def test_no_baseline_reports_level_with_neutral_score(self):
        result = compute_implied_volatility(45.0)
        assert result.value == 45.0
        assert result.score == 0.0

    def test_elevated_above_baseline_scores_positive(self):
        result = compute_implied_volatility(dvol=60.0, baseline=40.0)
        assert result.score > 0

    def test_below_baseline_scores_negative(self):
        result = compute_implied_volatility(dvol=25.0, baseline=40.0)
        assert result.score < 0

    def test_at_baseline_scores_zero(self):
        result = compute_implied_volatility(dvol=40.0, baseline=40.0)
        assert result.score == 0.0


class TestPutCallSkew:
    def test_put_skew_higher_than_call_iv_scores_positive(self):
        tickers = [
            _ticker("BTC-X-55000-P", mark_iv=75.0, delta=-0.25),
            _ticker("BTC-X-65000-C", mark_iv=60.0, delta=0.25),
        ]
        result = compute_put_call_skew(tickers)
        assert result.score > 0
        assert result.value == 15.0

    def test_call_skew_higher_than_put_iv_scores_negative(self):
        tickers = [
            _ticker("BTC-X-55000-P", mark_iv=55.0, delta=-0.25),
            _ticker("BTC-X-65000-C", mark_iv=70.0, delta=0.25),
        ]
        result = compute_put_call_skew(tickers)
        assert result.score < 0

    def test_picks_closest_to_target_delta_on_each_side(self):
        tickers = [
            _ticker("BTC-far-put", mark_iv=90.0, delta=-0.05),  # far from target
            _ticker("BTC-near-put", mark_iv=70.0, delta=-0.24),  # closest to 0.25
            _ticker("BTC-far-call", mark_iv=50.0, delta=0.05),  # far from target
            _ticker("BTC-near-call", mark_iv=60.0, delta=0.26),  # closest to 0.25
        ]
        result = compute_put_call_skew(tickers, target_delta=0.25)
        assert result.value == 10.0  # 70 - 60, from the near strikes, not the far ones

    def test_no_calls_available_is_neutral_not_an_error(self):
        tickers = [_ticker("BTC-X-55000-P", mark_iv=75.0, delta=-0.25)]
        result = compute_put_call_skew(tickers)
        assert result.score == 0.0

    def test_no_puts_available_is_neutral_not_an_error(self):
        tickers = [_ticker("BTC-X-65000-C", mark_iv=60.0, delta=0.25)]
        result = compute_put_call_skew(tickers)
        assert result.score == 0.0

    def test_empty_list_is_neutral(self):
        result = compute_put_call_skew([])
        assert result.score == 0.0

    def test_score_always_bounded(self):
        tickers = [
            _ticker("BTC-X-P", mark_iv=500.0, delta=-0.25),
            _ticker("BTC-X-C", mark_iv=1.0, delta=0.25),
        ]
        result = compute_put_call_skew(tickers)
        assert -1.0 <= result.score <= 1.0
