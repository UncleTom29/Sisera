"""End-to-End Pipeline Integration Test.

Verifies the full Sisera stack working seamlessly:
Observe (Data) -> Understand (Indicators) -> Predict (Scoring/Calibration) ->
Decide (Opportunity & Policy) -> Optimize (Portfolio & Risk) -> Execute (Adapter) ->
Reassess (Position Intelligence) -> Learn (Backtesting & Attribution).
"""

from unittest.mock import MagicMock

import numpy as np
import pandas as pd

from sisera.backtest.engine import BacktestEngine
from sisera.data.models import OrderBook, OrderBookLevel, Ticker, UniversePair
from sisera.execution.adapter import PaperExecutionAdapter
from sisera.indicators.engine import IndicatorEngine
from sisera.ledger.ledger import DecisionLedger
from sisera.opportunity.engine import OpportunityEngine
from sisera.opportunity.policy import DecisionPolicy
from sisera.orchestrator import Orchestrator
from sisera.position.engine import PositionIntelligenceEngine
from sisera.risk.manager import RiskManager
from sisera.scoring.ranking import RankingEngine
from sisera.scoring.scorer import ScoringEngine


def _generate_synthetic_crypto_series(n: int = 150) -> pd.DataFrame:
    np.random.seed(42)
    prices = [3000.0]
    for _i in range(1, n):
        ret = 0.003 + np.random.normal(0, 0.012)
        prices.append(prices[-1] * (1 + ret))

    return pd.DataFrame(
        {
            "open": prices,
            "high": [p * 1.012 for p in prices],
            "low": [p * 0.988 for p in prices],
            "close": prices,
            "volume": [2000.0 + i * 10 for i in range(n)],
        }
    )


def test_full_intelligence_stack_e2e(tmp_path):
    # 1. Initialize components
    db_file = str(tmp_path / "e2e_ledger.db")
    ledger = DecisionLedger(db_path=db_file)
    exec_adapter = PaperExecutionAdapter(initial_balance=20_000.0)
    ind_engine = IndicatorEngine()
    scoring_engine = ScoringEngine()
    ranking_engine = RankingEngine()
    opp_engine = OpportunityEngine(model_version="1.0.0", strategy_profile_version="1.0.0")
    policy = DecisionPolicy()
    risk_mgr = RiskManager()
    pos_intel = PositionIntelligenceEngine()

    df = _generate_synthetic_crypto_series(120)

    # 2. Learn (Backtest validation gate)
    bt_engine = BacktestEngine(
        indicator_engine=ind_engine,
        scoring_engine=scoring_engine,
        ranking_engine=ranking_engine,
        opportunity_engine=opp_engine,
        decision_policy=policy,
        risk_manager=risk_mgr,
        ledger=ledger,
    )
    bt_report = bt_engine.run_timeframe_backtest(
        symbol="ETHUSDT",
        timeframe="1h",
        ohlcv_df=df,
        initial_capital=20_000.0,
    )
    assert len(bt_report.equity_curve) > 50
    assert bt_report.expected_value is not None

    # 3. Live Scan & Execution Cycle via Orchestrator
    mock_bybit = MagicMock()
    last_p = float(df["close"].iloc[-1])
    mock_bybit.get_ticker.return_value = Ticker(
        symbol="ETHUSDT",
        last_price=last_p,
        mark_price=last_p * 1.0005,
        index_price=last_p,
        funding_rate=0.0001,
        open_interest=50000.0,
        bid_price=last_p * 0.9998,
        ask_price=last_p * 1.0002,
    )
    mock_bybit.get_orderbook.return_value = OrderBook(
        symbol="ETHUSDT",
        bids=[OrderBookLevel(price=last_p * 0.9995, size=50.0)],
        asks=[OrderBookLevel(price=last_p * 1.0005, size=50.0)],
        timestamp_ms=1000,
    )
    mock_bybit.get_klines.return_value = df.tail(80)

    mock_universe = MagicMock()
    mock_universe.get_universe.return_value = [
        UniversePair(
            symbol="ETHUSDT",
            base_coin="ETH",
            market_cap_source="coingecko",
            market_cap_source_id="ethereum",
            market_cap=400_000_000_000.0,
            market_cap_rank=2,
        )
    ]

    orch = Orchestrator(
        universe_manager=mock_universe,
        bybit_client=mock_bybit,
        indicator_engine=ind_engine,
        scoring_engine=scoring_engine,
        ranking_engine=ranking_engine,
        opportunity_engine=opp_engine,
        decision_policy=policy,
        risk_manager=risk_mgr,
        execution_adapter=exec_adapter,
        position_intelligence=pos_intel,
        ledger=ledger,
        initial_capital=20_000.0,
    )

    orch.refresh_universe()
    scan_report = orch.run_scan_cycle(timeframes=["1h"])

    assert scan_report.scanned_pairs_count == 1
    assert scan_report.ranked_candidates_count >= 1

    # Verify decision recorded in ledger
    records = ledger.query(symbol="ETHUSDT")
    assert len(records) >= 1
    assert records[0].opportunity_snapshot is not None

    # 4. Reassess (Fast monitor loop)
    orch.run_fast_position_monitor()
