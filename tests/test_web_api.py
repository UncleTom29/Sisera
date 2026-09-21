from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from sisera.data.models import MacroSnapshot, Ticker
from sisera.interfaces.web.app import create_app
from sisera.ledger.ledger import DecisionLedger
from sisera.ledger.models import DecisionLedgerEntry
from sisera.opportunity.models import TradeDirection
from sisera.orchestrator import ScanCycleReport
from sisera.risk.models import PortfolioState, Position


@pytest.fixture
def test_client_and_orch(tmp_path):
    db_file = str(tmp_path / "web_test_ledger.db")
    ledger = DecisionLedger(db_path=db_file)

    ledger.record(
        DecisionLedgerEntry(
            entry_id="web_dec_1",
            symbol="BTCUSDT",
            timeframe="1h",
            decision="TRADE",
            reason_codes=["ATTRACTIVE_EV", "HEALTHY_REGIME"],
            opportunity_snapshot={
                "symbol": "BTCUSDT",
                "direction": "LONG",
                "expected_value": 0.075,
                "p_win": 0.65,
                "epistemic_uncertainty": 0.12,
                "execution_quality_score": 0.85,
            },
            plain_language_rationale="Trade approved on 1h bullish trend.",
        )
    )

    mock_orch = MagicMock()
    mock_orch.ledger = ledger
    mock_orch.active_opportunities = {}
    mock_orch.current_universe = [MagicMock()]
    mock_orch.portfolio = PortfolioState(
        equity=20000.0,
        cash_balance=15000.0,
        peak_equity=20500.0,
        open_positions={
            "ETHUSDT": Position(
                symbol="ETHUSDT",
                direction=TradeDirection.LONG,
                entry_price=3000.0,
                size_notional=6000.0,
                leverage=3.0,
                margin=2000.0,
                liquidation_price=2100.0,
                stop_loss_price=2850.0,
                highest_price=3100.0,
            )
        },
    )
    mock_orch.risk_manager.check_circuit_breakers.return_value = (True, [])
    mock_orch.bybit_client.get_ticker.return_value = Ticker(
        symbol="ETHUSDT", last_price=3100.0, mark_price=3100.5, index_price=3100.2,
        funding_rate=0.0001, open_interest=50000.0, bid_price=3099.5, ask_price=3100.5,
    )
    mock_orch.run_scan_cycle.return_value = ScanCycleReport(
        timestamp_ms=1000,
        scanned_pairs_count=10,
        ranked_candidates_count=3,
        trades_executed_count=1,
        waits_count=1,
        no_trades_count=1,
        top_candidates=[],
        circuit_breakers_tripped=[],
    )

    # Event-intelligence layer state -- realistic values so /event-intelligence and
    # /attribution exercise real data shapes, not auto-generated MagicMock attributes.
    mock_orch.macro_enabled = True
    mock_orch.news_enabled = True
    mock_orch.x_enabled = False
    mock_orch.get_macro_snapshot.return_value = MacroSnapshot(
        fed_funds_rate=4.5, fed_funds_rate_1m_ago=4.75,
        treasury_10y_yield=4.2, treasury_10y_yield_1m_ago=4.1,
        cpi_yoy_pct=2.8, aggregate_tvl_usd=1.2e11, aggregate_tvl_7d_ago_usd=1.15e11,
    )
    mock_orch.recent_news_events = [
        {
            "symbol": "BTCUSDT", "source_type": "rss", "source_name": "coindesk",
            "title": "Test headline", "event_category": "macro_fed", "severity": 3,
            "score": -0.2, "urgency": 0.4, "confidence": 0.5, "reasoning": "test",
            "timestamp_ms": 1_700_000_000_000,
        }
    ]
    mock_orch.event_attribution_engine.get_source_reliability.return_value = 0.62
    mock_orch.event_attribution_engine.get_reliability_summary.return_value = (
        "source track record: 15 settled calls, rolling correlation +0.24"
    )
    mock_orch.recent_trade_attributions = [
        {
            "trade_id": "BTCUSDT_1", "symbol": "BTCUSDT", "direction": "LONG",
            "total_pnl": 42.5, "total_pnl_pct": 0.085,
            "signal_attribution": 30.0, "regime_attribution": 5.0, "timing_attribution": -1.0,
            "slippage_cost": 1.0, "exit_attribution": 8.5, "funding_cost": 0.5,
        }
    ]

    app = create_app(orchestrator=mock_orch, ledger=ledger)
    client = TestClient(app)
    return client, mock_orch


def test_api_status(test_client_and_orch):
    client, _ = test_client_and_orch
    resp = client.get("/api/status")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "RUNNING"
    assert data["circuit_breakers_healthy"] is True
    assert "1h" in data["active_timeframes"]


def test_api_portfolio(test_client_and_orch):
    client, _ = test_client_and_orch
    resp = client.get("/api/portfolio")
    assert resp.status_code == 200
    data = resp.json()
    # base_capital (20000.0) + real unrealized PnL: ETHUSDT LONG, entry 3000.0, mock
    # ticker last_price 3100.0, size_notional 6000.0 -> +$200.00
    assert data["equity"] == 20200.0
    assert data["cash_balance"] == 15000.0
    assert data["open_positions_count"] == 1


def test_api_positions(test_client_and_orch):
    client, _ = test_client_and_orch
    resp = client.get("/api/positions")
    assert resp.status_code == 200
    positions = resp.json()
    assert len(positions) == 1
    assert positions[0]["symbol"] == "ETHUSDT"
    assert positions[0]["direction"] == "LONG"
    assert positions[0]["leverage"] == 3.0


def test_api_candidates_and_decisions(test_client_and_orch):
    client, _ = test_client_and_orch
    # Candidates
    resp = client.get("/api/candidates")
    assert resp.status_code == 200
    candidates = resp.json()
    assert len(candidates) >= 1
    assert candidates[0]["symbol"] == "BTCUSDT"
    assert candidates[0]["decision"] == "TRADE"

    # Decisions
    resp_dec = client.get("/api/decisions?limit=5")
    assert resp_dec.status_code == 200
    decisions = resp_dec.json()
    assert len(decisions) >= 1
    assert decisions[0]["symbol"] == "BTCUSDT"


def test_api_candidates_trusts_ledger_decision_over_re_derivation(test_client_and_orch):
    """Regression test: /candidates used to re-derive a decision from opp_snap heuristics
    whenever recommended_size_pct was absent (which it always is for NO_CONVEX_SETUP
    snapshots) -- that re-derivation could disagree with and silently overwrite what the
    ledger actually recorded, e.g. displaying "TRADE" for an entry correctly recorded as
    NO_TRADE. A NO_TRADE decision with strong-looking EV/p_win/exec_quality (the exact
    scenario that used to trigger the wrong re-derivation) must still display as NO_TRADE."""
    client, mock_orch = test_client_and_orch
    mock_orch.ledger.record(
        DecisionLedgerEntry(
            entry_id="no_convex_1", symbol="SOLUSDT", timeframe="15m", decision="NO_TRADE",
            reason_codes=["NO_CONVEX_SETUP"],
            opportunity_snapshot={
                "symbol": "SOLUSDT", "direction": "LONG",
                # Deliberately strong-looking values -- these alone used to be enough to
                # get re-derived into a fabricated TRADE decision.
                "ev_r": 0.90, "p_win": 0.65, "execution_quality": 0.95,
                "epistemic_uncertainty": 0.10,
                # No recommended_size_pct -- exactly what a real NO_CONVEX_SETUP snapshot
                # looks like (see Orchestrator.run_scan_cycle).
                "decision_provenance": {"risk": 0.42, "regime": "TRENDING"},
                "regime_compatibility": "MEAN_REVERTING",
            },
            plain_language_rationale="NO_TRADE for SOLUSDT: no qualifying Convex Growth setup.",
        )
    )

    resp = client.get("/api/candidates")
    assert resp.status_code == 200
    candidates = resp.json()
    sol = next(c for c in candidates if c["symbol"] == "SOLUSDT")

    assert sol["decision"] == "NO_TRADE"
    assert sol["recommended_size_pct"] == 0.0
    # Real per-candidate risk from decision_provenance, not the fabricated 0.25 default.
    assert sol["risk"] == 0.42
    # Real regime_compatibility field, not the "provenance" typo that always fell back to
    # a hardcoded "TRENDING" regardless of the real value.
    assert sol["regime"] == "MEAN_REVERTING"


def test_api_profiles_and_attribution(test_client_and_orch):
    client, _ = test_client_and_orch
    resp_prof = client.get("/api/profiles")
    assert resp_prof.status_code == 200
    profiles = resp_prof.json()
    assert "15m" in profiles
    assert "1h" in profiles
    assert "4h" in profiles
    assert "1d" in profiles

    resp_attr = client.get("/api/attribution")
    assert resp_attr.status_code == 200
    attr_data = resp_attr.json()
    assert "why_not" in attr_data
    # Previously hardcoded to [] regardless of trading activity -- now reflects
    # Orchestrator.recent_trade_attributions.
    assert len(attr_data["recent_trades_attribution"]) == 1
    assert attr_data["recent_trades_attribution"][0]["symbol"] == "BTCUSDT"
    assert attr_data["recent_trades_attribution"][0]["total_pnl"] == 42.5


def test_api_event_intelligence(test_client_and_orch):
    client, _ = test_client_and_orch
    resp = client.get("/api/event-intelligence")
    assert resp.status_code == 200
    data = resp.json()

    assert data["macro_enabled"] is True
    assert data["news_enabled"] is True
    assert data["x_enabled"] is False

    assert data["macro"] is not None
    assert data["macro"]["fed_funds_rate"] == 4.5
    assert "regime_score" in data["macro"]
    assert "regime_reliability" in data["macro"]

    assert len(data["recent_events"]) == 1
    assert data["recent_events"][0]["symbol"] == "BTCUSDT"
    assert data["recent_events"][0]["severity"] == 3

    assert len(data["source_reliability"]) == 1
    assert data["source_reliability"][0]["source_name"] == "coindesk"
    assert data["source_reliability"][0]["reliability"] == 0.62


def test_api_event_intelligence_reports_disabled_features(test_client_and_orch):
    client, mock_orch = test_client_and_orch
    mock_orch.macro_enabled = False
    mock_orch.news_enabled = False

    resp = client.get("/api/event-intelligence")
    assert resp.status_code == 200
    data = resp.json()
    assert data["macro"] is None
    assert data["recent_events"] == []
    assert data["source_reliability"] == []


def test_api_market_intelligence_reports_live_data_ok(test_client_and_orch):
    client, mock_orch = test_client_and_orch
    mock_orch.bybit_client.get_ticker.side_effect = Exception("Bybit down")

    resp = client.get("/api/market-intelligence")
    assert resp.status_code == 200
    assert resp.json()["live_data_ok"] is False


def test_api_control_actions(test_client_and_orch):
    client, mock_orch = test_client_and_orch

    # 1. Trigger Scan
    resp_scan = client.post("/api/scan")
    assert resp_scan.status_code == 200
    assert resp_scan.json()["success"] is True

    # 2. Close Position
    resp_close = client.post("/api/positions/ETHUSDT/close")
    assert resp_close.status_code == 200
    assert resp_close.json()["symbol"] == "ETHUSDT"
    assert "ETHUSDT" not in mock_orch.portfolio.open_positions

    # 3. Emergency Stop
    resp_stop = client.post("/api/emergency_stop")
    assert resp_stop.status_code == 200
    assert resp_stop.json()["success"] is True


def test_static_index_html(test_client_and_orch):
    client, _ = test_client_and_orch
    resp = client.get("/")
    assert resp.status_code == 200
    assert "SISERA" in resp.text
    assert "Quantitative Perpetuals Intelligence" in resp.text or "QUANTITATIVE" in resp.text
