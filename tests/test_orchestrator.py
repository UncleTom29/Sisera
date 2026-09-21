from unittest.mock import MagicMock

import numpy as np
import pandas as pd

from sisera.alerts import AlertManager, AlertType
from sisera.data.models import OrderBook, OrderBookLevel, Ticker, UniversePair
from sisera.data.openrouter import OpenRouterClient
from sisera.execution.adapter import PaperExecutionAdapter
from sisera.ledger.ledger import DecisionLedger
from sisera.orchestrator import Orchestrator
from sisera.scoring.event_attribution import EventAttributionEngine
from sisera.scoring.llm_track_record import LLMTrackRecord
from sisera.scoring.news_relevance import CorroborationTracker, SeenNewsStore


def _generate_ohlcv(n: int = 80) -> pd.DataFrame:
    prices = np.linspace(100.0, 110.0, n)
    return pd.DataFrame(
        {
            "open": prices,
            "high": prices * 1.01,
            "low": prices * 0.99,
            "close": prices,
            "volume": [1000.0] * n,
        }
    )


def test_alert_manager():
    mgr = AlertManager()
    success = mgr.send_alert(
        AlertType.TRADE_OPENED,
        "Test Alert",
        "Test Message",
        {"symbol": "BTCUSDT"},
    )
    assert success is True
    assert len(mgr.sent_alerts) == 1
    assert mgr.sent_alerts[0]["type"] == "TRADE_OPENED"


def test_orchestrator_scan_cycle(tmp_path):
    db_file = str(tmp_path / "test_orch_ledger.db")
    ledger = DecisionLedger(db_path=db_file)
    exec_adapter = PaperExecutionAdapter(initial_balance=10000.0)

    # Mock Bybit client
    mock_bybit = MagicMock()
    mock_bybit.get_ticker.return_value = Ticker(
        symbol="BTCUSDT",
        last_price=50000.0,
        mark_price=50010.0,
        index_price=50000.0,
        funding_rate=0.0001,
        open_interest=10000.0,
        bid_price=49995.0,
        ask_price=50005.0,
    )
    mock_bybit.get_orderbook.return_value = OrderBook(
        symbol="BTCUSDT",
        bids=[OrderBookLevel(price=49990.0, size=20.0)],
        asks=[OrderBookLevel(price=50010.0, size=20.0)],
        timestamp_ms=1000,
    )
    mock_bybit.get_klines.return_value = _generate_ohlcv(80)

    # Mock universe
    mock_universe = MagicMock()
    mock_universe.get_universe.return_value = [
        UniversePair(
            symbol="BTCUSDT",
            base_coin="BTC",
            market_cap_source="coingecko",
            market_cap_source_id="bitcoin",
            market_cap=1_000_000_000_000.0,
            market_cap_rank=1,
        )
    ]

    orch = Orchestrator(
        universe_manager=mock_universe,
        bybit_client=mock_bybit,
        execution_adapter=exec_adapter,
        ledger=ledger,
        initial_capital=10_000.0,
    )

    orch.refresh_universe()
    report = orch.run_scan_cycle(timeframes=["1h"], max_scan_pairs=1)

    assert report.scanned_pairs_count == 1
    assert report.ranked_candidates_count >= 1
    # Check decision recorded in ledger
    entries = ledger.query(symbol="BTCUSDT")
    assert len(entries) >= 1


def test_run_news_monitor_cycle_settles_due_news_track_record_before_processing(tmp_path):
    """Regression test: run_news_monitor_cycle() previously never called
    settle_news_track_record() at all (the method didn't exist), and separately was never
    scheduled anywhere in the live app (see sisera/interfaces/web/app.py's
    _news_monitor_worker). This locks in the settlement half: a pending news_sentiment call
    past its resolve window must get settled the next time run_news_monitor_cycle() runs,
    even when there are no new headlines to process that cycle."""
    mock_bybit = MagicMock()
    mock_bybit.get_ticker.return_value = Ticker(
        symbol="BTCUSDT", last_price=70400.0, mark_price=70400.0, index_price=70400.0,
        funding_rate=0.0001, open_interest=10000.0, bid_price=70390.0, ask_price=70410.0,
    )

    orch = Orchestrator(bybit_client=mock_bybit, initial_capital=100.0)

    # Manually wire up the news-monitor attributes __init__ skips when news_enabled is
    # False at construction time (the test suite's default -- see conftest.py) -- mirrors
    # exactly what Orchestrator.__init__ sets up when SISERA_ENABLE_NEWS_MONITOR=true.
    orch.news_enabled = True
    orch.openrouter_client = OpenRouterClient(api_key="fake-key", base_url="https://fake.test")
    orch.news_feed_client = MagicMock()
    orch.news_feed_client.fetch_latest.return_value = []
    orch.telegram_news_monitor = MagicMock()
    orch.telegram_news_monitor.fetch_recent_messages.return_value = []
    orch.seen_news_store = SeenNewsStore(db_path=str(tmp_path / "seen.db"))
    orch.news_track_record = LLMTrackRecord(
        db_path=str(tmp_path / "track.db"), relevance_pruner=orch.relevance_pruner,
        indicator_name="news_sentiment", resolve_after_hours=4.0,
    )
    orch.event_attribution_engine = EventAttributionEngine(
        db_path=str(tmp_path / "track.db"), resolve_after_hours=4.0,
    )
    orch.corroboration_tracker = CorroborationTracker(db_path=str(tmp_path / "corrob.db"))

    far_past_ms = 1_000_000_000_000  # well past any resolve window
    orch.news_track_record.record_call(
        "BTCUSDT", "1h", "large_cap", score=0.6, confidence=0.7, reasoning="test",
        entry_price=64000.0, called_at_ms=far_past_ms,
    )
    assert orch.news_track_record.pending_count() == 1
    assert orch.news_track_record.settled_count() == 0

    result = orch.run_news_monitor_cycle()

    assert result == 0  # no new headlines this cycle, but settlement still ran
    assert orch.news_track_record.pending_count() == 0
    assert orch.news_track_record.settled_count() == 1


def test_record_trade_attribution_appends_real_attribution(tmp_path):
    """Regression test: TradeAttributionEngine.attribute_trade() existed but nothing ever
    called it, so /api/attribution's recent_trades_attribution was always []. Confirms
    Orchestrator.record_trade_attribution() (now called on every position EXIT and manual
    close) actually populates recent_trade_attributions with real decomposed P&L."""
    from sisera.opportunity.models import Opportunity, TradeDirection
    from sisera.risk.models import Position

    orch = Orchestrator(bybit_client=MagicMock(), initial_capital=100.0)
    assert orch.recent_trade_attributions == []

    pos = Position(
        symbol="BTCUSDT", direction=TradeDirection.LONG, entry_price=100.0,
        size_notional=1000.0, leverage=3.0, margin=333.0, liquidation_price=70.0,
        stop_loss_price=95.0, highest_price=110.0, lowest_price=98.0,
    )
    opp = Opportunity(
        opportunity_id="opp1", symbol="BTCUSDT", direction=TradeDirection.LONG,
        primary_timeframe="1h", entry_price=100.0, invalidation_price=95.0,
        invalidation_conditions=[], holding_horizon_bars=12, expected_value=0.05, p_win=0.6,
        epistemic_uncertainty=0.2,
    )

    orch.record_trade_attribution("BTCUSDT", pos, opp, exit_price=110.0)

    assert len(orch.recent_trade_attributions) == 1
    attribution = orch.recent_trade_attributions[0]
    assert attribution["symbol"] == "BTCUSDT"
    assert attribution["total_pnl"] > 0  # price rose, long position -> profit


def test_record_trade_attribution_failure_does_not_raise(tmp_path):
    """A failure in attribution bookkeeping must never block the caller (position
    close/manual close) -- it's bookkeeping, not risk-critical."""
    orch = Orchestrator(bybit_client=MagicMock(), initial_capital=100.0)
    # None args guarantee attribute_trade() raises internally.
    orch.record_trade_attribution("BTCUSDT", None, None, exit_price=100.0)
    assert orch.recent_trade_attributions == []


def test_news_monitor_worker_is_registered_in_app_lifespan():
    """Regression test for the other half of the same gap: run_news_monitor_cycle existed
    and was fully unit-tested in isolation, but nothing in the running app ever called it
    (only _live_stream_worker and _periodic_scan_worker were started in lifespan())."""
    from sisera.interfaces.web import app as web_app

    assert hasattr(web_app, "_news_monitor_worker")


def test_settle_decision_counterfactuals_populates_real_verdict(tmp_path):
    """Regression test: DecisionLedger.update_counterfactual() has existed since the
    ledger was built but nothing ever called it, so counterfactual_verdict was always None
    on every real entry -- which in turn made DriftDetectionEngine's calibration score
    always fall back to a flat default regardless of any real decision ever made."""
    from sisera.ledger.models import DecisionLedgerEntry

    mock_bybit = MagicMock()
    mock_bybit.get_ticker.return_value = Ticker(
        symbol="BTCUSDT", last_price=110.0, mark_price=110.0, index_price=110.0,
        funding_rate=0.0001, open_interest=10000.0, bid_price=109.9, ask_price=110.1,
    )
    ledger = DecisionLedger(db_path=str(tmp_path / "ledger.db"))
    orch = Orchestrator(bybit_client=mock_bybit, ledger=ledger, initial_capital=100.0)

    far_past_ms = 1_000_000_000_000  # well past the 4h default settlement window
    ledger.record(
        DecisionLedgerEntry(
            entry_id="dec1", symbol="BTCUSDT", timeframe="1h", decision="TRADE",
            opportunity_snapshot={"entry_price": 100.0, "direction": "LONG"},
            timestamp_ms=far_past_ms,
        )
    )

    settled = orch.settle_decision_counterfactuals(hours=4.0)

    assert settled == 1
    entry = ledger.get_entry("dec1")
    assert entry.counterfactual_verdict == "PROFITABLE_TRADE"  # 100 -> 110, LONG, real gain


def test_settle_decision_counterfactuals_skips_already_verdicted_and_recent_entries(tmp_path):
    from sisera.ledger.models import DecisionLedgerEntry

    mock_bybit = MagicMock()
    mock_bybit.get_ticker.return_value = Ticker(
        symbol="BTCUSDT", last_price=110.0, mark_price=110.0, index_price=110.0,
        funding_rate=0.0001, open_interest=10000.0, bid_price=109.9, ask_price=110.1,
    )
    ledger = DecisionLedger(db_path=str(tmp_path / "ledger.db"))
    orch = Orchestrator(bybit_client=mock_bybit, ledger=ledger, initial_capital=100.0)

    far_past_ms = 1_000_000_000_000
    now_ms = int(__import__("time").time() * 1000)
    ledger.record(
        DecisionLedgerEntry(
            entry_id="already_verdicted", symbol="BTCUSDT", timeframe="1h", decision="TRADE",
            opportunity_snapshot={"entry_price": 100.0, "direction": "LONG"},
            timestamp_ms=far_past_ms, counterfactual_verdict="PROFITABLE_TRADE",
        )
    )
    ledger.record(
        DecisionLedgerEntry(
            entry_id="too_recent", symbol="BTCUSDT", timeframe="1h", decision="TRADE",
            opportunity_snapshot={"entry_price": 100.0, "direction": "LONG"},
            timestamp_ms=now_ms,
        )
    )

    settled = orch.settle_decision_counterfactuals(hours=4.0)
    assert settled == 0
