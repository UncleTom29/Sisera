"""Unit tests for the Sisera Convex Growth v1 Strategy Engine."""

from __future__ import annotations

import pytest

from sisera.data.models import OrderBook, OrderBookLevel, Ticker
from sisera.indicators.composite import CascadeRegime, RegimeState, RegimeType, StabilityState
from sisera.opportunity.models import TradeDirection
from sisera.scoring.models import (
    FamilyScore,
    IndicatorFamilyScores,
    PairScore,
)
from sisera.strategy.convex_growth import (
    ConvexGrowthStrategy,
    SetupType,
    StrategicRegime,
)


def _create_mock_score(net_score: float, confidence: float = 0.65, uncertainty: float = 0.15) -> PairScore:
    fam_scores = {
        "technical": FamilyScore(family="technical", score=net_score, weight=0.35, indicator_count=6, agreement=0.9),
        "derivatives": FamilyScore(family="derivatives", score=net_score * 1.2, weight=0.35, indicator_count=4, agreement=0.9),
        "fundamental": FamilyScore(family="fundamental", score=0.0, weight=0.1, indicator_count=0, agreement=1.0),
        "options": FamilyScore(family="options", score=0.0, weight=0.0, indicator_count=0, agreement=1.0),
        "composite": FamilyScore(family="composite", score=net_score, weight=0.2, indicator_count=3, agreement=0.8),
    }
    ind_families = IndicatorFamilyScores(
        families=fam_scores,
        cross_family_disagreement=0.05,
        net_family_score=net_score,
    )
    reg_state = RegimeState(
        regime_type=RegimeType.TRENDING,
        stability=StabilityState.STABLE,
        stability_score=0.85,
        cascade_regime=CascadeRegime.NONE,
        adx_value=28.0,
        hurst_estimate=0.62,
        volatility_ratio=1.05,
    )
    return PairScore(
        symbol="BTCUSDT",
        timeframe="1h",
        composite_score=net_score,
        confidence=confidence,
        risk=0.20,
        expected_value=0.85,
        epistemic_uncertainty=uncertainty,
        p_win=0.60,
        data_confidence=1.0,
        family_breakdown=ind_families,
        regime_state=reg_state,
        raw_scores={},
        reason_codes=[],
    )


def test_4h_strategic_compass_regimes():
    strat = ConvexGrowthStrategy()

    # Bull regime
    score_bull = _create_mock_score(net_score=0.15)
    assert strat._determine_4h_regime(score_bull, btc_stability=0.85) == StrategicRegime.BULL

    # Bear regime
    score_bear = _create_mock_score(net_score=-0.15)
    assert strat._determine_4h_regime(score_bear, btc_stability=0.85) == StrategicRegime.BEAR

    # Range regime
    score_range = _create_mock_score(net_score=0.02)
    assert strat._determine_4h_regime(score_range, btc_stability=0.85) == StrategicRegime.RANGE

    # Transition regime when BTC stability is degraded (< 0.45)
    assert strat._determine_4h_regime(score_bull, btc_stability=0.35) == StrategicRegime.TRANSITION


def test_1h_structural_confirmation():
    strat = ConvexGrowthStrategy()
    ticker = Ticker(
        symbol="BTCUSDT",
        last_price=64000.0,
        index_price=64005.0,
        mark_price=64000.0,
        bid_price=63999.0,
        ask_price=64001.0,
        funding_rate=0.0001,
        open_interest=50000.0,
        volume_24h=100000.0,
    )

    # 4H Bull + 1H Bullish score -> Confirmation passes with LONG
    score_1h_bull = _create_mock_score(net_score=0.06)
    direction, passed, factors = strat._evaluate_1h_confirmation(
        score_1h_bull, StrategicRegime.BULL, ticker, None
    )
    assert passed is True
    assert direction == TradeDirection.LONG
    assert len(factors) >= 1

    # 4H Bull + 1H Bearish score -> Confirmation fails
    score_1h_bear = _create_mock_score(net_score=-0.06)
    direction_fail, passed_fail, _ = strat._evaluate_1h_confirmation(
        score_1h_bear, StrategicRegime.BULL, ticker, None
    )
    assert passed_fail is False
    assert direction_fail is None


def test_15m_asymmetric_entry_and_utility():
    strat = ConvexGrowthStrategy()
    scores_by_tf = {
        "4h": _create_mock_score(net_score=0.12, confidence=0.70),
        "1h": _create_mock_score(net_score=0.08, confidence=0.68),
        "15m": _create_mock_score(net_score=0.05, confidence=0.65, uncertainty=0.12),
    }
    ticker = Ticker(
        symbol="BTCUSDT",
        last_price=64000.0,
        index_price=64005.0,
        mark_price=64000.0,
        bid_price=63999.0,
        ask_price=64001.0,
        funding_rate=0.0001,
        open_interest=50000.0,
        volume_24h=100000.0,
    )

    sig = strat.evaluate_candidate(
        symbol="BTCUSDT",
        scores_by_tf=scores_by_tf,
        ticker=ticker,
        order_book=None,
        btc_stability=0.85,
        account_equity=100.0,
    )

    assert sig is not None
    assert sig.symbol == "BTCUSDT"
    assert sig.direction == TradeDirection.LONG
    assert sig.regime_4h == StrategicRegime.BULL
    assert sig.target_rr_ratio == 3.0
    assert sig.stop_distance_pct == 0.015
    assert sig.production_utility > 0.25
    assert len(sig.invalidation_triggers) >= 4
