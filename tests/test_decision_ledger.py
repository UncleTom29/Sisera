from sisera.backtest.attribution import TradeAttributionEngine
from sisera.ledger.ledger import DecisionLedger
from sisera.ledger.models import DecisionLedgerEntry
from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.risk.models import Position


def test_decision_ledger_crud(tmp_path):
    db_file = str(tmp_path / "test_ledger.db")
    ledger = DecisionLedger(db_path=db_file)

    entry = DecisionLedgerEntry(
        entry_id="dec_btc_1",
        symbol="BTCUSDT",
        timeframe="1h",
        decision="TRADE",
        model_version="1.0.0",
        strategy_profile_version="1.0.0",
        risk_policy_version="1.0.0",
        execution_policy_version="1.0.0",
        reason_codes=["ATTRACTIVE_EV", "HEALTHY_REGIME"],
        opportunity_snapshot={"symbol": "BTCUSDT", "entry_price": 50000.0},
        plain_language_rationale="TRADE approved based on high EV and stable trending regime.",
    )

    ledger.record(entry)

    retrieved = ledger.get_entry("dec_btc_1")
    assert retrieved is not None
    assert retrieved.symbol == "BTCUSDT"
    assert retrieved.decision == "TRADE"
    assert "ATTRACTIVE_EV" in retrieved.reason_codes
    assert retrieved.opportunity_snapshot["entry_price"] == 50000.0

    all_entries = ledger.query(symbol="BTCUSDT")
    assert len(all_entries) == 1


def test_record_does_not_fabricate_a_counterfactual_verdict(tmp_path):
    """Regression test: record() used to synthesize a fake "PROFITABLE_TRADE"
    (TRADE/PROBE) or "CORRECT_ABSTENTION" (WAIT/NO_TRADE) verdict with a fake return
    (2.40/-0.35) for every entry immediately at write time, regardless of what actually
    happened -- meaning counterfactual_verdict was 100% fabricated for every entry the
    ledger has ever recorded. A freshly-recorded entry should have no verdict yet; real
    verdicts come later from Orchestrator.settle_decision_counterfactuals()."""
    ledger = DecisionLedger(db_path=str(tmp_path / "fresh_ledger.db"))

    trade_entry = DecisionLedgerEntry(
        entry_id="fresh_trade", symbol="BTCUSDT", timeframe="1h", decision="TRADE",
    )
    no_trade_entry = DecisionLedgerEntry(
        entry_id="fresh_no_trade", symbol="ETHUSDT", timeframe="1h", decision="NO_TRADE",
    )
    ledger.record(trade_entry)
    ledger.record(no_trade_entry)

    assert ledger.get_entry("fresh_trade").counterfactual_verdict is None
    assert ledger.get_entry("fresh_trade").counterfactual_return_4h is None
    assert ledger.get_entry("fresh_no_trade").counterfactual_verdict is None


def test_ledger_methods_do_not_leak_open_connections(tmp_path):
    """Regression test: every DecisionLedger method used to open a fresh sqlite3
    connection via `with self._get_connection() as conn:` and never close it (Python's
    `with conn:` only manages the transaction, not the connection lifecycle) -- confirmed
    via lsof against a real long-running instance showing multiple leaked file
    descriptors on the same ledger DB, which is a real, live-observed contributor to
    intermittent "database is locked" errors under sustained scan-cycle load."""
    import gc
    import sqlite3

    db_path = str(tmp_path / "leak_test.db")
    ledger = DecisionLedger(db_path=db_path)
    ledger.record(DecisionLedgerEntry(entry_id="e1", symbol="BTCUSDT", timeframe="1h", decision="TRADE"))
    ledger.get_entry("e1")
    ledger.query(symbol="BTCUSDT")
    ledger.update_counterfactual("e1", return_4h=1.0)
    gc.collect()  # sqlite3.Connection.__del__ would otherwise mask a leak in this check

    open_connections = [obj for obj in gc.get_objects() if isinstance(obj, sqlite3.Connection)]
    assert open_connections == []


def test_record_preserves_an_explicitly_provided_verdict(tmp_path):
    """A caller (e.g. settle_decision_counterfactuals' real settlement) that explicitly
    sets a real verdict before recording should have it preserved, not overwritten."""
    ledger = DecisionLedger(db_path=str(tmp_path / "explicit_ledger.db"))
    entry = DecisionLedgerEntry(
        entry_id="explicit1", symbol="BTCUSDT", timeframe="1h", decision="TRADE",
        counterfactual_verdict="PROFITABLE_TRADE", counterfactual_return_4h=3.2,
    )
    ledger.record(entry)

    retrieved = ledger.get_entry("explicit1")
    assert retrieved.counterfactual_verdict == "PROFITABLE_TRADE"
    assert retrieved.counterfactual_return_4h == 3.2


def test_trade_attribution_and_why_not():
    attr_engine = TradeAttributionEngine()

    opp = Opportunity(
        opportunity_id="opp_btc_attr",
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        primary_timeframe="1h",
        entry_price=50000.0,
        invalidation_price=48000.0,
        invalidation_conditions=[],
        holding_horizon_bars=12,
        expected_value=0.08,
        p_win=0.70,
        epistemic_uncertainty=0.15,
        regime_stability=0.90,
    )
    pos = Position(
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        entry_price=50000.0,
        size_notional=5000.0,
        leverage=3.0,
        margin=1666.67,
        liquidation_price=34000.0,
        stop_loss_price=48000.0,
        accumulated_funding=5.0,
    )

    # Exited at 52500 (+5% gross return)
    trade_attr = attr_engine.attribute_trade(
        trade_id="tr_1",
        position=pos,
        opportunity=opp,
        exit_price=52500.0,
        slippage_paid=2.5,
    )

    assert trade_attr.total_pnl > 200.0
    assert trade_attr.signal_attribution > 0
    assert trade_attr.funding_cost == 5.0

    # "Why not?" attribution test
    entries = [
        DecisionLedgerEntry(
            entry_id="d1",
            symbol="ETHUSDT",
            timeframe="1h",
            decision="NO_TRADE",
            reason_codes=["SUB_THRESHOLD_UTILITY", "HIGH_RISK"],
        ),
        DecisionLedgerEntry(
            entry_id="d2",
            symbol="SOLUSDT",
            timeframe="1h",
            decision="WAIT",
            reason_codes=["POOR_EXECUTION_CONDITIONS"],
        ),
        DecisionLedgerEntry(
            entry_id="d3",
            symbol="BTCUSDT",
            timeframe="1h",
            decision="TRADE",
            reason_codes=["ATTRACTIVE_EV"],
        ),
    ]

    why_not = attr_engine.aggregate_why_not(entries)
    assert why_not.total_decisions == 3
    assert why_not.total_trades == 1
    assert why_not.total_waits == 1
    assert why_not.total_no_trades == 1
    assert "SUB_THRESHOLD_UTILITY" in why_not.reason_code_counts
    assert "POOR_EXECUTION_CONDITIONS" in why_not.reason_code_counts
