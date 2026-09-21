import pytest

from sisera.data.models import OrderBook, OrderBookLevel, Ticker
from sisera.indicators.composite import (
    CascadeRegime,
    RegimeState,
    RegimeType,
    StabilityState,
)
from sisera.opportunity.engine import OpportunityEngine
from sisera.opportunity.models import DecisionType, TradeDirection
from sisera.opportunity.policy import DecisionPolicy
from sisera.scoring.models import (
    FamilyScore,
    IndicatorFamily,
    IndicatorFamilyScores,
    PairScore,
    RankedCandidate,
)


@pytest.fixture
def sample_candidate():
    regime = RegimeState(
        regime_type=RegimeType.TRENDING,
        stability=StabilityState.STABLE,
        stability_score=0.9,
        cascade_regime=CascadeRegime.NONE,
        adx_value=30.0,
        hurst_estimate=0.6,
        volatility_ratio=1.0,
    )
    fam_scores = IndicatorFamilyScores(
        families={
            "technical": FamilyScore(
                family=IndicatorFamily.TECHNICAL,
                score=0.7,
                weight=0.35,
                indicator_count=3,
                agreement=0.9,
            )
        },
        cross_family_disagreement=0.1,
        net_family_score=0.7,
    )
    ps = PairScore(
        symbol="ETHUSDT",
        timeframe="1h",
        confidence=0.75,
        risk=0.30,
        expected_value=0.10,
        epistemic_uncertainty=0.15,
        p_win=0.70,
        data_confidence=0.95,
        family_breakdown=fam_scores,
        regime_state=regime,
    )
    return RankedCandidate(
        symbol="ETHUSDT",
        primary_timeframe="1h",
        composite_confidence=0.75,
        composite_risk=0.30,
        composite_ev=0.10,
        composite_uncertainty=0.15,
        timeframe_scores={"1h": ps},
        rank=1,
        data_confidence=0.95,
        regime_stability=0.9,
    )


def test_opportunity_engine_packaging(sample_candidate):
    engine = OpportunityEngine(model_version="1.0.0", strategy_profile_version="1.0.0")
    ticker = Ticker(
        symbol="ETHUSDT",
        last_price=3000.0,
        mark_price=3000.5,
        index_price=3000.0,
        funding_rate=0.0001,
        open_interest=50000.0,
        bid_price=2999.8,
        ask_price=3000.2,
    )
    book = OrderBook(
        symbol="ETHUSDT",
        bids=[OrderBookLevel(price=2999.0, size=50.0)],
        asks=[OrderBookLevel(price=3001.0, size=50.0)],
        timestamp_ms=1000,
    )

    opp = engine.package(candidate=sample_candidate, ticker=ticker, order_book=book, atr_value=60.0)

    assert opp.symbol == "ETHUSDT"
    assert opp.direction == TradeDirection.LONG
    assert opp.entry_price == 3000.0
    assert opp.invalidation_price < 3000.0  # Stop below entry for LONG
    assert len(opp.invalidation_conditions) >= 3
    assert opp.execution_quality > 0.6
    assert opp.decision_provenance["model_version"] == "1.0.0"


def test_decision_policy_trade_vs_wait_vs_notrade(sample_candidate):
    opp_engine = OpportunityEngine()
    policy = DecisionPolicy(utility_threshold=0.02, min_execution_quality=0.40)

    ticker = Ticker(
        symbol="ETHUSDT",
        last_price=3000.0,
        mark_price=3000.5,
        index_price=3000.0,
        funding_rate=0.0001,
        open_interest=50000.0,
        bid_price=2999.8,
        ask_price=3000.2,
    )
    good_book = OrderBook(
        symbol="ETHUSDT",
        bids=[OrderBookLevel(price=2999.0, size=50.0)],
        asks=[OrderBookLevel(price=3001.0, size=50.0)],
        timestamp_ms=1000,
    )

    # 1. Normal good opportunity -> TRADE
    opp_good = opp_engine.package(sample_candidate, ticker, good_book, atr_value=50.0)
    res_trade = policy.decide(opp_good)
    assert res_trade.decision == DecisionType.TRADE
    assert res_trade.expected_utility > 0.02

    # 2. Good thesis but empty orderbook -> WAIT
    empty_book = OrderBook(
        symbol="ETHUSDT",
        bids=[OrderBookLevel(price=2980.0, size=0.1)],
        asks=[OrderBookLevel(price=3020.0, size=0.1)],
        timestamp_ms=1000,
    )
    opp_thin = opp_engine.package(sample_candidate, ticker, empty_book, atr_value=50.0)
    res_wait = policy.decide(opp_thin)
    assert res_wait.decision == DecisionType.WAIT
    assert "POOR_EXECUTION_CONDITIONS" in res_wait.reason_codes

    # 3. High uncertainty / poor EV -> NO_TRADE
    opp_thin.expected_value = -0.05
    opp_thin.epistemic_uncertainty = 0.60
    res_notrade = policy.decide(opp_thin)
    assert res_notrade.decision == DecisionType.NO_TRADE
    assert len(policy.get_abstention_records()) >= 2


def test_decision_policy_probe_and_sizing_tiers(sample_candidate):
    opp_engine = OpportunityEngine()
    policy = DecisionPolicy()

    ticker = Ticker(
        symbol="OPUSDT",
        last_price=2.0,
        mark_price=2.0,
        index_price=2.0,
        funding_rate=0.00005,
        open_interest=50000.0,
        bid_price=1.999,
        ask_price=2.001,
    )
    good_book = OrderBook(
        symbol="OPUSDT",
        bids=[OrderBookLevel(price=1.999, size=500.0)],
        asks=[OrderBookLevel(price=2.001, size=500.0)],
        timestamp_ms=1000,
    )

    opp = opp_engine.package(sample_candidate, ticker, good_book, atr_value=0.04)
    opp.p_win = 0.42
    opp.expected_value = 0.35
    opp.ev_r = 0.35
    opp.execution_quality = 0.90
    opp.epistemic_uncertainty = 0.18

    # 42% P(win) and +0.35R EV -> PROBE (25% size)
    res_probe = policy.decide(opp)
    assert res_probe.decision == DecisionType.PROBE
    assert res_probe.recommended_size_pct == 0.25

    # 46% P(win) and +0.60R EV -> TRADE (75% size)
    opp.p_win = 0.46
    opp.expected_value = 0.60
    opp.ev_r = 0.60
    res_trade_75 = policy.decide(opp)
    assert res_trade_75.decision == DecisionType.TRADE
    assert res_trade_75.recommended_size_pct == 0.75
