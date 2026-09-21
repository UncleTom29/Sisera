from unittest.mock import MagicMock

import responses

from sisera.alerts import AlertType
from sisera.interfaces.telegram.bot import SiseraTelegramBot
from sisera.ledger.ledger import DecisionLedger
from sisera.ledger.models import DecisionLedgerEntry
from sisera.opportunity.models import TradeDirection
from sisera.risk.models import PortfolioState, Position


def test_telegram_bot_commands(tmp_path):
    db_file = str(tmp_path / "tg_test_ledger.db")
    ledger = DecisionLedger(db_path=db_file)

    # Populate dummy decision
    ledger.record(
        DecisionLedgerEntry(
            entry_id="tg_dec_1",
            symbol="BTCUSDT",
            timeframe="1h",
            decision="TRADE",
            reason_codes=["HIGH_EV"],
            opportunity_snapshot={"expected_value": 0.08, "p_win": 0.65},
            plain_language_rationale="Trade approved on 1h bullish trend.",
        )
    )

    # Mock Orchestrator
    mock_orch = MagicMock()
    mock_orch.ledger = ledger
    mock_orch.active_opportunities = {}
    mock_orch.portfolio = PortfolioState(
        equity=15000.0,
        cash_balance=10000.0,
        peak_equity=16000.0,
        open_positions={
            "ETHUSDT": Position(
                symbol="ETHUSDT",
                direction=TradeDirection.LONG,
                entry_price=3000.0,
                size_notional=5000.0,
                leverage=3.0,
                margin=1666.67,
                liquidation_price=2100.0,
                stop_loss_price=2850.0,
                highest_price=3100.0,
                accumulated_funding=1.5,
            )
        },
    )
    mock_orch.risk_manager.check_circuit_breakers.return_value = (True, [])

    bot = SiseraTelegramBot(
        orchestrator=mock_orch,
        ledger=ledger,
        token="MOCK_TOKEN",
        chat_id="123456",
    )

    # 1. /help
    help_resp = bot.handle_command("/help")
    assert "/status" in help_resp
    assert "/positions" in help_resp

    # 2. /status
    status_resp = bot.handle_command("/status")
    assert "$15,000.00" in status_resp
    assert "Circuit Breakers" in status_resp

    # 3. /positions
    pos_resp = bot.handle_command("/positions")
    assert "ETHUSDT" in pos_resp
    assert "LONG" in pos_resp
    assert "$5,000.00" in pos_resp

    # 4. /scan & /decisions
    scan_resp = bot.handle_command("/scan")
    assert "BTCUSDT" in scan_resp

    dec_resp = bot.handle_command("/decisions 3")
    assert "BTCUSDT" in dec_resp

    # 5. /circuit_breakers
    cb_resp = bot.handle_command("/circuit_breakers")
    assert "Max Drawdown" in cb_resp
    assert "HEALTHY" in cb_resp

    # 6. /close
    close_resp = bot.handle_command("/close ETHUSDT")
    assert "ETHUSDT" in close_resp
    assert "ETHUSDT" not in mock_orch.portfolio.open_positions

    # 7. /emergency_stop
    stop_resp = bot.handle_command("/emergency_stop")
    assert "EMERGENCY STOP TRIGGERED" in stop_resp


def test_telegram_alert_formatting():
    bot = SiseraTelegramBot(token="MOCK_TOKEN", chat_id="123456")
    msg = bot.format_alert_message(
        AlertType.TRADE_OPENED,
        title="Opened Long on BTCUSDT",
        message="Size $5000 (3.0x) @ 50,000",
        metadata={"ev": 0.08, "sl": 48500},
    )
    assert "🚀" in msg
    assert "BTCUSDT" in msg
    assert "• `ev`: 0.08" in msg


@responses.activate
def test_telegram_api_calls():
    bot = SiseraTelegramBot(token="TEST_BOT_TOKEN", chat_id="123456")

    # Mock sendMessage
    responses.add(
        responses.POST,
        "https://api.telegram.org/botTEST_BOT_TOKEN/sendMessage",
        json={"ok": True, "result": {"message_id": 101}},
        status=200,
    )

    res = bot.send_message("Test message")
    assert res is not None
    assert res["ok"] is True

    # Mock getUpdates
    responses.add(
        responses.GET,
        "https://api.telegram.org/botTEST_BOT_TOKEN/getUpdates",
        json={
            "ok": True,
            "result": [
                {
                    "update_id": 1,
                    "message": {
                        "chat": {"id": 123456},
                        "text": "/help",
                    },
                }
            ],
        },
        status=200,
    )

    updates = bot.poll_updates_once()
    assert len(updates) == 1
    assert bot.last_update_id == 1
