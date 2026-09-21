import numpy as np

from sisera.data.models import OrderBook, OrderBookLevel, Ticker, UniversePair
from sisera.indicators.base import IndicatorResult
from sisera.indicators.composite import (
    CascadeRegime,
    RegimeState,
    RegimeType,
    StabilityState,
)
from sisera.indicators.engine import EngineOutput
from sisera.scoring.calibration import (
    ChampionChallengerTracker,
    ConformalPredictor,
    DriftDetector,
    IsotonicCalibrator,
    SimpleGradientBoostedEstimator,
)
from sisera.scoring.ranking import RankingEngine
from sisera.scoring.scorer import ScoringEngine


def test_simple_gradient_boosted_estimator():
    np.random.seed(42)
    X = np.random.randn(50, 4)
    y = 2.0 * X[:, 0] - 1.5 * X[:, 1] + np.random.randn(50) * 0.1

    gbm = SimpleGradientBoostedEstimator(n_estimators=10, learning_rate=0.2)
    gbm.fit(X, y)
    preds = gbm.predict(X)

    mse = float(np.mean((preds - y) ** 2))
    assert mse < float(np.var(y)) * 0.5


def test_isotonic_calibrator():
    uncalibrated = np.array([-1.5, -0.5, 0.0, 0.5, 1.5])
    labels = np.array([0, 0, 1, 1, 1])

    cal = IsotonicCalibrator()
    cal.fit(uncalibrated, labels)

    p_low = cal.calibrate(-1.2)
    p_high = cal.calibrate(1.2)
    assert p_low <= p_high
    assert 0.0 < p_low < 0.5
    assert 0.5 < p_high < 1.0


def test_conformal_predictor():
    preds = np.array([0.2, 0.4, 0.6, 0.8])
    y_true = np.array([0.0, 0.0, 1.0, 1.0])

    conf = ConformalPredictor(alpha=0.10)
    conf.fit(preds, y_true)

    p_low, p_high, uncertainty = conf.predict_interval_and_uncertainty(0.65)
    assert p_low <= 0.65 <= p_high
    assert 0.0 < uncertainty <= 1.0


def test_champion_challenger_tracker():
    tracker = ChampionChallengerTracker(min_shadow_evaluations=10, improvement_margin=0.02)
    # Challenger predicts better
    for _ in range(15):
        tracker.record_outcome(champ_prob=0.5, chall_prob=0.9, actual_win=1.0)

    res = tracker.evaluate()
    assert res.evaluations_count == 15
    assert res.challenger_brier_score < res.champion_brier_score
    assert res.challenger_promoted is True


def test_drift_detector():
    detector = DriftDetector(calibration_drift_threshold=0.10, window_size=10)
    # Predict high win rate, but actual outcomes are 0
    for _ in range(12):
        detector.record_step(predicted_p=0.85, outcome=0.0)

    report = detector.check_drift()
    assert report.has_drift is True
    assert report.calibration_drift > 0.5
    assert report.recommended_action in ("REDUCE_SIZING", "DISABLE_PROFILE")


def test_scoring_engine_and_ranking():
    engine = ScoringEngine()

    regime_state = RegimeState(
        regime_type=RegimeType.TRENDING,
        stability=StabilityState.STABLE,
        stability_score=0.9,
        cascade_regime=CascadeRegime.NONE,
        adx_value=32.0,
        hurst_estimate=0.62,
        volatility_ratio=1.1,
    )

    results_btc = [
        IndicatorResult(name="ema_crossover", score=0.6, value=120.0),
        IndicatorResult(name="rsi", score=0.5, value=62.0),
        IndicatorResult(name="funding_rate", score=0.4, value=0.0001),
        IndicatorResult(name="order_book_imbalance", score=0.7, value=0.3),
        IndicatorResult(name="smart_money_divergence", score=0.8, value=0.8),
        IndicatorResult(name="regime_detector", score=0.7, value=32.0),
    ]

    output_btc = EngineOutput(results=results_btc, regime_state=regime_state, coverage_ratio=0.9)

    ticker = Ticker(
        symbol="BTCUSDT",
        last_price=50000.0,
        mark_price=50010.0,
        index_price=50000.0,
        funding_rate=0.0001,
        open_interest=10000.0,
        bid_price=49995.0,
        ask_price=50005.0,
    )
    book = OrderBook(
        symbol="BTCUSDT",
        bids=[OrderBookLevel(price=49990.0, size=20.0)],
        asks=[OrderBookLevel(price=50010.0, size=20.0)],
        timestamp_ms=1000,
    )
    upair = UniversePair(
        symbol="BTCUSDT",
        base_coin="BTC",
        market_cap_source="coingecko",
        market_cap_source_id="bitcoin",
        market_cap=1_000_000_000_000.0,
        market_cap_rank=1,
    )

    score_1h = engine.score(
        symbol="BTCUSDT",
        timeframe="1h",
        engine_output=output_btc,
        universe_pair=upair,
        ticker=ticker,
        order_book=book,
    )

    assert score_1h.confidence > 0.5
    assert score_1h.risk < 0.6
    assert score_1h.expected_value > 0.0
    assert score_1h.family_breakdown.cross_family_disagreement < 0.5
    assert "technical" in score_1h.family_breakdown.families
    assert "derivatives" in score_1h.family_breakdown.families

    # Test ranking with multiple pairs
    score_4h = engine.score(
        symbol="BTCUSDT",
        timeframe="4h",
        engine_output=output_btc,
        universe_pair=upair,
        ticker=ticker,
        order_book=book,
    )

    scores_by_pair = {
        "BTCUSDT": {"1h": score_1h, "4h": score_4h},
    }

    ranker = RankingEngine()
    ranked = ranker.rank(scores_by_pair)
    assert len(ranked) == 1
    assert ranked[0].symbol == "BTCUSDT"
    assert ranked[0].rank == 1
