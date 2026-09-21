from __future__ import annotations

from sisera.data.models import MacroSnapshot
from sisera.indicators.macro import compute_macro_regime


def test_all_missing_data_returns_neutral_score_and_zero_reliability():
    result = compute_macro_regime(MacroSnapshot())

    assert result.name == "macro_regime"
    assert result.score == 0.0
    assert result.value == 0.0
    assert result.reliability == 0.0


def test_full_risk_on_data_scores_bullish_with_full_reliability():
    snapshot = MacroSnapshot(
        fed_funds_rate=4.5, fed_funds_rate_1m_ago=5.0,  # rate falling
        treasury_10y_yield=4.0, treasury_10y_yield_1m_ago=4.5,  # yields falling
        cpi_yoy_pct=2.0,  # right at target -- benign
        aggregate_tvl_usd=110.0, aggregate_tvl_7d_ago_usd=100.0,  # TVL rising
    )
    result = compute_macro_regime(snapshot)

    assert result.score > 0.0
    assert result.reliability == 1.0
    assert result.value == 4.0


def test_full_risk_off_data_scores_bearish_with_full_reliability():
    snapshot = MacroSnapshot(
        fed_funds_rate=5.5, fed_funds_rate_1m_ago=5.0,  # rate rising
        treasury_10y_yield=5.3, treasury_10y_yield_1m_ago=4.5,  # yields rising sharply
        cpi_yoy_pct=6.0,  # well above target
        aggregate_tvl_usd=90.0, aggregate_tvl_7d_ago_usd=100.0,  # TVL falling
    )
    result = compute_macro_regime(snapshot)

    assert result.score < 0.0
    assert result.reliability == 1.0


def test_partial_data_reduces_reliability_without_failing():
    snapshot = MacroSnapshot(fed_funds_rate=4.5, fed_funds_rate_1m_ago=5.0)  # only 1 of 4 sub-signals
    result = compute_macro_regime(snapshot)

    assert result.reliability == 0.25
    assert result.value == 1.0
    assert -1.0 <= result.score <= 1.0


def test_score_is_always_within_bounds():
    snapshot = MacroSnapshot(
        fed_funds_rate=0.0, fed_funds_rate_1m_ago=100.0,
        treasury_10y_yield=0.0, treasury_10y_yield_1m_ago=100.0,
        cpi_yoy_pct=-1000.0,
        aggregate_tvl_usd=1e12, aggregate_tvl_7d_ago_usd=1.0,
    )
    result = compute_macro_regime(snapshot)

    assert -1.0 <= result.score <= 1.0
