import pytest
from sisera.intelligence.market_intel import MarketIntelligenceEngine


def test_market_intelligence_trending_synthesis():
    engine = MarketIntelligenceEngine()
    intel = engine.compute(
        btc_ticker_price=63000.0,
        btc_regime_type="TRENDING",
        btc_stability=0.85,
        avg_funding=0.00008,
        dvol=52.4,
    )

    assert "TRENDING" in intel.btc_regime
    assert intel.market_breadth_pct == 68.0
    assert intel.volatility_state == "EXPANDING"
    assert intel.funding_sentiment == "NEUTRAL+"
    assert intel.crowding_index == "LOW"
    assert "bullish continuation" in intel.system_thesis.lower()


def test_market_intelligence_transitioning_synthesis():
    engine = MarketIntelligenceEngine()
    intel = engine.compute(
        btc_ticker_price=60000.0,
        btc_regime_type="TRANSITIONING",
        btc_stability=0.35,
        avg_funding=-0.0002,
        dvol=65.0,
    )

    assert "TRANSITIONING" in intel.btc_regime
    assert intel.crowding_index == "ELEVATED"
    assert intel.risk_appetite == "RISK_OFF"
    assert "transition" in intel.system_thesis.lower()


def test_open_interest_trend_and_liquidity_health_are_real_not_hardcoded():
    """Regression test: both were previously flat literals ("RISING (+3.8% 24h)",
    "HEALTHY") regardless of any input, since no parameter existed at all for either."""
    engine = MarketIntelligenceEngine()

    no_data = engine.compute(oi_change_24h_pct=None, near_touch_depth_usd=None)
    assert no_data.open_interest_trend == "insufficient history yet"
    assert no_data.liquidity_health == "unknown"

    rising = engine.compute(oi_change_24h_pct=5.2, near_touch_depth_usd=200_000.0)
    assert "RISING" in rising.open_interest_trend
    assert "5.2" in rising.open_interest_trend
    assert rising.liquidity_health == "HEALTHY"

    falling = engine.compute(oi_change_24h_pct=-6.0, near_touch_depth_usd=5_000.0)
    assert "FALLING" in falling.open_interest_trend
    assert falling.liquidity_health == "THIN"
