from __future__ import annotations

import pytest

from sisera.data.models import NewsAssessment, Ticker
from sisera.indicators.composite import CascadeRegime, RegimeState, RegimeType, StabilityState
from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.position.engine import PositionIntelligenceEngine
from sisera.position.models import PositionAction
from sisera.risk.models import Position


def _news(**overrides) -> NewsAssessment:
    defaults = {
        "symbol": "ETHUSDT", "news_item_id": "item-1", "score": -0.8, "urgency": 0.9,
        "confidence": 0.8, "reasoning": "Founder announced resignation.",
        "model": "test/model", "timestamp_ms": 1_000_000_000_000,
    }
    defaults.update(overrides)
    return NewsAssessment(**defaults)


@pytest.fixture
def long_position_and_opp():
    opp = Opportunity(
        opportunity_id="opp_eth", symbol="ETHUSDT", direction=TradeDirection.LONG,
        primary_timeframe="1h", entry_price=3000.0, invalidation_price=2850.0,
        invalidation_conditions=[], holding_horizon_bars=12, expected_value=0.08,
        p_win=0.68, epistemic_uncertainty=0.15,
    )
    pos = Position(
        symbol="ETHUSDT", direction=TradeDirection.LONG, entry_price=3000.0,
        size_notional=3000.0, leverage=3.0, margin=1000.0, liquidation_price=2050.0,
        stop_loss_price=2850.0, highest_price=3050.0,
    )
    return pos, opp


@pytest.fixture
def healthy_regime():
    return RegimeState(
        regime_type=RegimeType.TRENDING, stability=StabilityState.STABLE, stability_score=0.9,
        cascade_regime=CascadeRegime.NONE, adx_value=30.0, hurst_estimate=0.6, volatility_ratio=1.0,
    )


@pytest.fixture
def healthy_ticker():
    return Ticker(
        symbol="ETHUSDT", last_price=3050.0, mark_price=3050.0, index_price=3050.0,
        funding_rate=0.0001, open_interest=50000.0, bid_price=3049.0, ask_price=3051.0,
    )


class TestBreakingNewsExit:
    def test_high_confidence_high_urgency_adverse_news_exits_long(
        self, long_position_and_opp, healthy_regime, healthy_ticker
    ):
        pos, opp = long_position_and_opp
        engine = PositionIntelligenceEngine()
        result = engine.reevaluate(
            pos, opp, healthy_ticker, healthy_regime,
            news=_news(score=-0.8, urgency=0.9, confidence=0.8),  # intensity = 0.64
        )
        assert result.action == PositionAction.EXIT
        assert "BREAKING_NEWS_ADVERSE" in result.reason_codes

    def test_moderate_adverse_news_reduces_not_exits(
        self, long_position_and_opp, healthy_regime, healthy_ticker
    ):
        pos, opp = long_position_and_opp
        engine = PositionIntelligenceEngine()
        result = engine.reevaluate(
            pos, opp, healthy_ticker, healthy_regime,
            news=_news(score=-0.6, urgency=0.7, confidence=0.5),  # intensity = 0.3
        )
        assert result.action == PositionAction.REDUCE
        assert result.size_adjustment_factor == pytest.approx(0.7)

    def test_low_confidence_unverified_news_does_not_trigger_full_exit(
        self, long_position_and_opp, healthy_regime, healthy_ticker
    ):
        # High urgency, dramatic-sounding score, but low confidence (single unverified
        # source) -- should not blow through to a full exit on one unconfirmed post.
        pos, opp = long_position_and_opp
        engine = PositionIntelligenceEngine()
        result = engine.reevaluate(
            pos, opp, healthy_ticker, healthy_regime,
            news=_news(score=-0.9, urgency=0.9, confidence=0.2),  # intensity = 0.18
        )
        assert result.action != PositionAction.EXIT

    def test_below_urgency_threshold_falls_through_to_normal_logic(
        self, long_position_and_opp, healthy_regime, healthy_ticker
    ):
        pos, opp = long_position_and_opp
        engine = PositionIntelligenceEngine()
        result = engine.reevaluate(
            pos, opp, healthy_ticker, healthy_regime,
            news=_news(score=-0.9, urgency=0.1, confidence=0.9),  # urgency below default 0.5
        )
        assert result.action == PositionAction.HOLD

    def test_favorable_news_does_not_trigger_exit_or_reduce(
        self, long_position_and_opp, healthy_regime, healthy_ticker
    ):
        pos, opp = long_position_and_opp
        engine = PositionIntelligenceEngine()
        result = engine.reevaluate(
            pos, opp, healthy_ticker, healthy_regime,
            news=_news(score=+0.9, urgency=0.9, confidence=0.9),  # bullish, LONG benefits
        )
        assert result.action == PositionAction.HOLD

    def test_bullish_news_is_adverse_for_short_position(self, healthy_regime, healthy_ticker):
        opp = Opportunity(
            opportunity_id="opp_eth_short", symbol="ETHUSDT", direction=TradeDirection.SHORT,
            primary_timeframe="1h", entry_price=3100.0, invalidation_price=3250.0,
            invalidation_conditions=[], holding_horizon_bars=12, expected_value=0.08,
            p_win=0.68, epistemic_uncertainty=0.15,
        )
        pos = Position(
            symbol="ETHUSDT", direction=TradeDirection.SHORT, entry_price=3100.0,
            size_notional=3000.0, leverage=3.0, margin=1000.0, liquidation_price=4000.0,
            stop_loss_price=3250.0, lowest_price=3050.0,
        )
        engine = PositionIntelligenceEngine()
        result = engine.reevaluate(
            pos, opp, healthy_ticker, healthy_regime,
            news=_news(score=+0.8, urgency=0.9, confidence=0.8),  # bullish, adverse for SHORT
        )
        assert result.action == PositionAction.EXIT

    def test_no_news_is_a_no_op(self, long_position_and_opp, healthy_regime, healthy_ticker):
        pos, opp = long_position_and_opp
        engine = PositionIntelligenceEngine()
        result = engine.reevaluate(pos, opp, healthy_ticker, healthy_regime, news=None)
        assert result.action == PositionAction.HOLD
