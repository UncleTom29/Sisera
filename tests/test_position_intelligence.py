import pytest

from sisera.data.models import Ticker
from sisera.indicators.composite import (
    CascadeRegime,
    RegimeState,
    RegimeType,
    StabilityState,
)
from sisera.opportunity.models import (
    InvalidationCondition,
    Opportunity,
    TradeDirection,
)
from sisera.position.engine import PositionIntelligenceEngine
from sisera.position.models import PositionAction
from sisera.risk.models import Position


@pytest.fixture
def open_position_and_opp():
    opp = Opportunity(
        opportunity_id="opp_eth_pos",
        symbol="ETHUSDT",
        direction=TradeDirection.LONG,
        primary_timeframe="1h",
        entry_price=3000.0,
        invalidation_price=2850.0,
        invalidation_conditions=[
            InvalidationCondition(
                condition_type="OI_COLLAPSE",
                threshold_value=-0.08,
                description="OI drops >8%",
            ),
            InvalidationCondition(
                condition_type="FUNDING_FLIP",
                threshold_value=0.0004,
                description="Funding flips against long",
            ),
            InvalidationCondition(
                condition_type="REGIME_SHIFT",
                threshold_value=0.40,
                description="Regime stability drops",
            ),
        ],
        holding_horizon_bars=12,
        expected_value=0.08,
        p_win=0.68,
        epistemic_uncertainty=0.15,
    )
    pos = Position(
        symbol="ETHUSDT",
        direction=TradeDirection.LONG,
        entry_price=3000.0,
        size_notional=3000.0,
        leverage=3.0,
        margin=1000.0,
        liquidation_price=2050.0,
        stop_loss_price=2850.0,
        highest_price=3000.0,
    )
    return pos, opp


def test_position_intelligence_hold_and_stop_exit(open_position_and_opp):
    pos, opp = open_position_and_opp
    engine = PositionIntelligenceEngine()

    regime_ok = RegimeState(
        regime_type=RegimeType.TRENDING,
        stability=StabilityState.STABLE,
        stability_score=0.9,
        cascade_regime=CascadeRegime.NONE,
        adx_value=30.0,
        hurst_estimate=0.6,
        volatility_ratio=1.0,
    )
    ticker_ok = Ticker(
        symbol="ETHUSDT",
        last_price=3050.0,
        mark_price=3050.0,
        index_price=3050.0,
        funding_rate=0.0001,
        open_interest=50000.0,
        bid_price=3049.0,
        ask_price=3051.0,
    )

    # 1. Normal healthy state -> HOLD
    eval_hold = engine.reevaluate(pos, opp, ticker_ok, regime_ok)
    assert eval_hold.action == PositionAction.HOLD

    # 2. Stop loss breached -> EXIT
    ticker_stopped = Ticker(
        symbol="ETHUSDT",
        last_price=2800.0,  # Below 2850 stop
        mark_price=2800.0,
        index_price=2800.0,
        funding_rate=0.0001,
        open_interest=50000.0,
        bid_price=2799.0,
        ask_price=2801.0,
    )
    eval_stop = engine.reevaluate(pos, opp, ticker_stopped, regime_ok)
    assert eval_stop.action == PositionAction.EXIT
    assert "STOP_LOSS_BREACHED" in eval_stop.reason_codes


def test_position_intelligence_early_invalidation_and_tighten(open_position_and_opp):
    pos, opp = open_position_and_opp
    engine = PositionIntelligenceEngine()

    regime_trans = RegimeState(
        regime_type=RegimeType.CHOP,
        stability=StabilityState.TRANSITIONING,
        stability_score=0.35,
        cascade_regime=CascadeRegime.NONE,
        adx_value=18.0,
        hurst_estimate=0.48,
        volatility_ratio=1.9,
    )
    ticker_flipped = Ticker(
        symbol="ETHUSDT",
        last_price=2950.0,  # Stop not hit yet (2850), but conditions degraded
        mark_price=2950.0,
        index_price=2950.0,
        funding_rate=0.0006,  # > 0.0004
        open_interest=40000.0,
        bid_price=2949.0,
        ask_price=2951.0,
    )

    # Invalidation condition: OI collapsed + Funding flipped -> early EXIT
    eval_inval = engine.reevaluate(
        pos, opp, ticker_flipped, regime_trans, oi_pct_change_since_entry=-0.12
    )
    assert eval_inval.action in (PositionAction.EXIT, PositionAction.TIGHTEN_STOP)
    assert len(eval_inval.reason_codes) >= 1
