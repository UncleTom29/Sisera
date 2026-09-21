from sisera.scoring.profiles import default_timeframe_profiles
from sisera.scoring.relevance import IndicatorRelevancePruner, classify_market_cap_cluster


def test_timeframe_strategy_profiles():
    profiles = default_timeframe_profiles()
    assert "15m" in profiles
    assert "1h" in profiles
    assert "4h" in profiles
    assert "1d" in profiles

    # 15m should include liquidation_cascade, but not put_call_skew
    assert profiles["15m"].is_indicator_applicable("liquidation_cascade")
    assert not profiles["15m"].is_indicator_applicable("put_call_skew")

    # 1d should include options and fundamentals
    assert profiles["1d"].is_indicator_applicable("implied_volatility")
    assert profiles["1d"].is_indicator_applicable("put_call_skew")

    # Validate gating check
    passed, reasons = profiles["1h"].validate_gating(
        {
            "expected_value": 0.05,
            "profit_factor": 1.45,
            "max_drawdown": 0.12,
            "deflated_sharpe_ratio": 0.95,
        }
    )
    assert passed is True
    assert len(reasons) == 0

    failed, reasons_fail = profiles["1h"].validate_gating(
        {
            "expected_value": 0.01,  # below 0.03
            "profit_factor": 1.10,  # below 1.25
            "max_drawdown": 0.25,  # above 0.20
            "deflated_sharpe_ratio": 0.50,  # below 0.80
        }
    )
    assert failed is False
    assert len(reasons_fail) == 4


def test_indicator_relevance_pruning():
    pruner = IndicatorRelevancePruner(relevance_threshold=0.02, min_evaluations_before_prune=3)

    # Indicator with negative contribution across 3 rounds
    pruner.record_evaluation("15m", "small_cap", "obv", -0.01)
    pruner.record_evaluation("15m", "small_cap", "obv", -0.02)
    pruner.record_evaluation("15m", "small_cap", "obv", -0.03)

    pruned = pruner.get_pruned_indicators("15m", "small_cap")
    assert "obv" in pruned

    # Good indicator
    pruner.record_evaluation("15m", "small_cap", "liquidation_cascade", 0.08)
    pruner.record_evaluation("15m", "small_cap", "liquidation_cascade", 0.09)
    pruner.record_evaluation("15m", "small_cap", "liquidation_cascade", 0.10)

    pruned_after = pruner.get_pruned_indicators("15m", "small_cap")
    assert "liquidation_cascade" not in pruned_after

    active = pruner.get_active_indicators("15m", "small_cap", {"obv", "liquidation_cascade", "rsi"})
    assert active == {"liquidation_cascade", "rsi"}


def test_classify_market_cap_cluster():
    assert classify_market_cap_cluster(1) == "large_cap"
    assert classify_market_cap_cluster(20) == "large_cap"
    assert classify_market_cap_cluster(50) == "mid_cap"
    assert classify_market_cap_cluster(150) == "small_cap"
