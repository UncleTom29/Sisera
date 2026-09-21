"""Unit tests for DriftDetectionEngine and DifferentialIntelligenceEngine."""

from sisera.intelligence.differential_engine import DifferentialIntelligenceEngine
from sisera.intelligence.drift_engine import DriftDetectionEngine
from sisera.ledger.models import DecisionLedgerEntry


def test_drift_detection_engine_health_report():
    engine = DriftDetectionEngine()
    report = engine.compute_health_report()

    assert report.overall_health_pct > 70.0
    assert report.health_verdict in ("HEALTHY", "STABLE")
    assert report.calibration_score_pct >= 90.0
    assert "15m" in report.timeframe_profiles
    assert "1h" in report.timeframe_profiles
    assert "4h" in report.timeframe_profiles
    assert "1d" in report.timeframe_profiles
    assert report.timeframe_profiles["15m"].status == "LIVE"
    assert report.timeframe_profiles["1d"].status == "MONITOR"


def test_differential_intelligence_engine():
    engine = DifferentialIntelligenceEngine()
    diff = engine.compute_differential(
        current_btc_stability=0.85,
        current_funding=0.00008,
        current_book_ev=2.83,
    )

    assert len(diff.delta_items) >= 4
    assert any("BTC Regime" in item["label"] for item in diff.delta_items)
    assert any("Portfolio EV" in item["label"] for item in diff.delta_items)
    assert "BTC regime stability" in diff.narrative_summary


def test_btc_regime_stability_delta_is_real_not_hardcoded():
    """Regression test: current_btc_stability was accepted as a parameter but never read
    anywhere in the function body -- the delta item was always the literal
    "85% (Stable ↑ +8%)" regardless of the real value passed in."""
    engine = DifferentialIntelligenceEngine()
    engine.compute_differential(current_btc_stability=0.85)  # seed a "previous" snapshot
    diff = engine.compute_differential(current_btc_stability=0.40)  # big real drop

    stability_item = next(i for i in diff.delta_items if i["label"] == "BTC Regime Stability")
    assert "40%" in stability_item["delta"]
    assert "Transitioning" in stability_item["delta"]
    assert stability_item["direction"] == "down"


def test_liquidation_buffer_label_is_real_when_score_provided():
    """Regression test: was always the literal "Robust (>30% avg)" regardless of actual
    portfolio state, since no parameter existed at all for this."""
    engine = DifferentialIntelligenceEngine()

    unavailable = engine.compute_differential(liquidation_risk_score=None)
    liq_item = next(i for i in unavailable.delta_items if i["label"] == "Liquidation Buffers")
    assert liq_item["delta"] == "Not available"

    risky = DifferentialIntelligenceEngine().compute_differential(liquidation_risk_score=75.0)
    liq_item_risky = next(i for i in risky.delta_items if i["label"] == "Liquidation Buffers")
    assert "Thin" in liq_item_risky["delta"]


def test_drift_engine_calibration_uses_real_settled_verdicts():
    """Regression test: calibration_score_pct previously read nonexistent
    DecisionLedgerEntry attributes (calibrated_p_win/p_win/confidence), always falling
    through to a flat 0.62 regardless of any real decision ever made. Now built from
    counterfactual_verdict, which Orchestrator.settle_decision_counterfactuals() actually
    populates."""
    engine = DriftDetectionEngine()

    # 10 TRADE decisions, all predicted p_win=0.9, all actually lost -- badly miscalibrated.
    entries = [
        DecisionLedgerEntry(
            entry_id=f"e{i}", symbol="BTCUSDT", timeframe="1h", decision="TRADE",
            opportunity_snapshot={"p_win": 0.9}, counterfactual_verdict="STOPPED_OUT",
        )
        for i in range(10)
    ]
    report = engine.compute_health_report(ledger_entries=entries)
    assert report.calibration_score_pct < 60.0  # predicted 90%, realized 0% -> poor calibration

    # 10 TRADE decisions, predicted p_win=0.6, 6/10 actually won -- well calibrated.
    good_entries = [
        DecisionLedgerEntry(
            entry_id=f"g{i}", symbol="BTCUSDT", timeframe="1h", decision="TRADE",
            opportunity_snapshot={"p_win": 0.6},
            counterfactual_verdict="PROFITABLE_TRADE" if i < 6 else "STOPPED_OUT",
        )
        for i in range(10)
    ]
    good_report = engine.compute_health_report(ledger_entries=good_entries)
    assert good_report.calibration_score_pct > 90.0


def test_drift_engine_calibration_cold_start_below_minimum_settled():
    engine = DriftDetectionEngine()
    entries = [
        DecisionLedgerEntry(
            entry_id="e1", symbol="BTCUSDT", timeframe="1h", decision="TRADE",
            opportunity_snapshot={"p_win": 0.9}, counterfactual_verdict="STOPPED_OUT",
        )
    ]
    report = engine.compute_health_report(ledger_entries=entries)
    assert report.calibration_score_pct == 93.0
