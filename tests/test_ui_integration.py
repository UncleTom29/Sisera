from unittest.mock import MagicMock

import numpy as np
import pandas as pd
from fastapi.testclient import TestClient

from sisera.alerts import AlertType
from sisera.data.models import OrderBook, OrderBookLevel, Ticker, UniversePair
from sisera.execution.adapter import PaperExecutionAdapter
from sisera.interfaces.telegram.bot import SiseraTelegramBot
from sisera.interfaces.web.app import create_app
from sisera.ledger.ledger import DecisionLedger
from sisera.orchestrator import Orchestrator


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


def test_ui_full_integration(tmp_path):
    db_file = str(tmp_path / "integrated_ui_ledger.db")
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

    # 1. Run Scan Cycle via Orchestrator
    orch.run_scan_cycle(timeframes=["1h"], max_scan_pairs=1)

    # 2. Test Web API seeing the scanned opportunities & portfolio
    app = create_app(orchestrator=orch, ledger=ledger)
    client = TestClient(app)

    port_resp = client.get("/api/portfolio")
    assert port_resp.status_code == 200
    assert port_resp.json()["equity"] == 10000.0

    cand_resp = client.get("/api/candidates")
    assert cand_resp.status_code == 200
    assert len(cand_resp.json()) >= 1
    assert cand_resp.json()[0]["symbol"] == "BTCUSDT"

    # 3. Test Telegram Bot seeing the scanned opportunities & portfolio
    tg_bot = SiseraTelegramBot(orchestrator=orch, ledger=ledger, token="MOCK", chat_id="123")
    status_msg = tg_bot.handle_command("/status")
    assert "$10,000.00" in status_msg

    scan_msg = tg_bot.handle_command("/scan")
    assert "BTCUSDT" in scan_msg

    # 4. Trigger scan via Web API
    web_scan_resp = client.post("/api/scan")
    assert web_scan_resp.status_code == 200
    assert web_scan_resp.json()["success"] is True

    # 5. Alert dispatch to Telegram
    formatted = tg_bot.format_alert_message(
        AlertType.TRADE_OPENED,
        title="Opened Long on BTCUSDT",
        message="Size $2,000.00 (5.0x)",
        metadata={"ev": 0.08},
    )
    assert "🚀" in formatted
    assert "BTCUSDT" in formatted
