"""Sisera Telegram Bot Interface. See SCOPE.md §14.

Interactive bot command handlers and real-time push alert broadcasting
via Telegram Bot REST API.
"""

from __future__ import annotations

import logging
import threading
import time
from typing import Any

import requests

from sisera.alerts import AlertType
from sisera.config import config
from sisera.ledger.ledger import DecisionLedger
from sisera.orchestrator import Orchestrator

logger = logging.getLogger(__name__)


class SiseraTelegramBot:
    """Telegram Bot interface for Sisera.

    Supports interactive commands and push alerts.
    """

    def __init__(
        self,
        orchestrator: Orchestrator | None = None,
        ledger: DecisionLedger | None = None,
        token: str | None = None,
        chat_id: str | None = None,
        api_base_url: str = "https://api.telegram.org",
    ) -> None:
        self.orchestrator = orchestrator
        self.ledger = ledger or (orchestrator.ledger if orchestrator else None) or DecisionLedger()
        self.token = token or config.telegram_bot_token
        self.chat_id = chat_id or config.telegram_chat_id
        self.api_base_url = api_base_url
        self.last_update_id = 0
        self._polling = False
        self._poll_thread: threading.Thread | None = None

    @property
    def bot_url(self) -> str:
        return f"{self.api_base_url}/bot{self.token}"

    def send_message(
        self,
        text: str,
        chat_id: str | None = None,
        parse_mode: str = "Markdown",
    ) -> dict[str, Any] | None:
        """Sends a text message via Telegram Bot API."""
        target_chat = chat_id or self.chat_id
        if not self.token or not target_chat:
            logger.debug(
                "Telegram bot token or chat_id not configured; message logged instead: %s",
                text,
            )
            return None

        try:
            resp = requests.post(
                f"{self.bot_url}/sendMessage",
                json={
                    "chat_id": target_chat,
                    "text": text,
                    "parse_mode": parse_mode,
                    "disable_web_page_preview": True,
                },
                timeout=10.0,
            )
            resp.raise_for_status()
            return resp.json()
        except Exception as exc:  # noqa: BLE001
            logger.warning("Failed to send Telegram message: %s", exc)
            return None

    def handle_command(self, command_text: str, chat_id: str | None = None) -> str:
        """Processes a text command and returns the response string."""
        cmd = command_text.strip()
        parts = cmd.split()
        root_cmd = parts[0].lower() if parts else ""

        if root_cmd in ("/start", "/help"):
            return self._cmd_help()
        if root_cmd in ("/status", "/portfolio"):
            return self._cmd_status()
        if root_cmd == "/positions":
            return self._cmd_positions()
        if root_cmd == "/scan":
            return self._cmd_scan()
        if root_cmd == "/decisions":
            limit = int(parts[1]) if len(parts) > 1 and parts[1].isdigit() else 5
            return self._cmd_decisions(limit=limit)
        if root_cmd == "/circuit_breakers":
            return self._cmd_circuit_breakers()
        if root_cmd == "/close":
            if len(parts) < 2:
                return "⚠️ Usage: `/close <SYMBOL>` (e.g. `/close BTCUSDT`)"
            return self._cmd_close_position(parts[1].upper())
        if root_cmd == "/emergency_stop":
            return self._cmd_emergency_stop()

        return f"❓ Unknown command `{root_cmd}`. Type `/help` for available commands."

    def _cmd_help(self) -> str:
        return (
            "🤖 *Sisera Quantitative Trading Bot*\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            "📊 *Monitoring & Portfolio:*\n"
            "• `/status` - Portfolio equity, margin ratio, 24h P&L, breakers\n"
            "• `/positions` - Active positions, unrealized P&L, stop levels\n"
            "• `/circuit_breakers` - Current risk ceilings and trip status\n\n"
            "🔍 *Intelligence & Scanning:*\n"
            "• `/scan` - View latest multi-timeframe ranked opportunities\n"
            "• `/decisions [N]` - View recent immutable decision ledger records\n\n"
            "⚡ *Control & Execution:*\n"
            "• `/close <SYMBOL>` - Market-close a specific open position\n"
            "• `/emergency_stop` - Emergency halt & de-risk\n"
            "• `/help` - Show this menu"
        )

    def _cmd_status(self) -> str:
        if not self.orchestrator:
            return "⚠️ Orchestrator not connected."

        p = self.orchestrator.portfolio
        passed_breakers, reasons = self.orchestrator.risk_manager.check_circuit_breakers(p)
        breaker_status = (
            "🟢 ACTIVE (Normal)" if passed_breakers else f"🔴 TRIPPED ({', '.join(reasons)})"
        )

        open_cnt = len(p.open_positions)
        dd_pct = p.current_drawdown_pct * 100.0
        dd_max = config.max_portfolio_drawdown_pct * 100.0
        margin_pct = p.margin_ratio * 100.0
        margin_max = config.max_portfolio_margin_ratio * 100.0

        return (
            "📊 *Sisera System & Portfolio Status*\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"💰 *Equity:* `${p.equity:,.2f}`\n"
            f"💵 *Cash Balance:* `${p.cash_balance:,.2f}`\n"
            f"📈 *Peak Equity:* `${p.peak_equity:,.2f}`\n"
            f"📉 *Drawdown:* `{dd_pct:.2f}%` (Max: `{dd_max:.1f}%`)\n"
            f"🛡️ *Margin Ratio:* `{margin_pct:.1f}%` (Max: `{margin_max:.1f}%`)\n"
            f"💼 *Open Positions:* `{open_cnt}` / `{config.top_n_portfolio_size}`\n"
            f"🔄 *Daily Trades:* `{p.daily_trades_count}` / `{config.max_daily_trades}`\n"
            f"⚡ *Circuit Breakers:* {breaker_status}"
        )

    def _cmd_positions(self) -> str:
        if not self.orchestrator or not self.orchestrator.portfolio.open_positions:
            return "💼 *Positions:* No active open positions."

        lines = ["💼 *Active Open Positions:*", "━━━━━━━━━━━━━━━━━━━━━━"]
        for symbol, pos in self.orchestrator.portfolio.open_positions.items():
            dir_emoji = "🟢 LONG" if pos.direction.value == "LONG" else "🔴 SHORT"
            stop_p = pos.trailing_stop_price or pos.stop_loss_price
            funding_str = f"${pos.accumulated_funding:.2f}"

            lines.append(
                f"*{symbol}* ({dir_emoji} `{pos.leverage:.1f}x`)\n"
                f"• Notional: `${pos.size_notional:,.2f}` | Margin: `${pos.margin:,.2f}`\n"
                f"• Entry: `${pos.entry_price:,.4f}`\n"
                f"• Stop Loss: `${stop_p:,.4f}`\n"
                f"• Liq Price: `${pos.liquidation_price:,.4f}`\n"
                f"• Funding Accrued: `{funding_str}`\n"
            )
        return "\n".join(lines)

    def _cmd_scan(self) -> str:
        if not self.orchestrator:
            return "⚠️ Orchestrator not connected."

        # Fetch recent ledger entries
        entries = self.ledger.query(limit=5)
        if not entries:
            return "🔍 *Universe Scan:* No recent scan records in Decision Ledger."

        lines = ["🔍 *Latest Candidate Opportunities:*", "━━━━━━━━━━━━━━━━━━━━━━"]
        for entry in entries:
            opp_snap = entry.opportunity_snapshot
            ev_str = f"EV: {opp_snap.get('expected_value', 0.0):+.2%}"
            pwin_str = f"P(win): {opp_snap.get('p_win', 0.5):.1%}"
            dec_badge = (
                "🟢 TRADE"
                if entry.decision == "TRADE"
                else ("🟡 WAIT" if entry.decision == "WAIT" else "⚪ NO_TRADE")
            )

            lines.append(
                f"*{entry.symbol}* ({entry.timeframe}) → {dec_badge}\n"
                f"• `{ev_str}` | `{pwin_str}`\n"
                f"• Rationale: _{entry.plain_language_rationale}_\n"
            )
        return "\n".join(lines)

    def _cmd_decisions(self, limit: int = 5) -> str:
        entries = self.ledger.query(limit=limit)
        if not entries:
            return "📖 *Decision Ledger:* No records logged yet."

        lines = [f"📖 *Recent Decision Ledger ({len(entries)} entries):*", "━━━━━━━━━━━━━━━━━━━━━━"]
        for e in entries:
            t_str = time.strftime("%H:%M:%S", time.gmtime(e.timestamp_ms / 1000))
            reasons = ", ".join(e.reason_codes[:3]) if e.reason_codes else "None"
            lines.append(
                f"⏱️ `{t_str} UTC` | *{e.symbol}* ({e.timeframe}) → *{e.decision}*\n"
                f"• Reasons: `{reasons}`\n"
                f"• _{e.plain_language_rationale}_\n"
            )
        return "\n".join(lines)

    def _cmd_circuit_breakers(self) -> str:
        if not self.orchestrator:
            return "⚠️ Orchestrator not connected."

        p = self.orchestrator.portfolio
        passed, reasons = self.orchestrator.risk_manager.check_circuit_breakers(p)

        dd_curr = p.current_drawdown_pct
        dd_max = config.max_portfolio_drawdown_pct
        margin_curr = p.margin_ratio
        margin_max = config.max_portfolio_margin_ratio
        dd_icon = "🔴" if dd_curr > dd_max else "🟢"
        dd_stat = f"• Max Drawdown: `{dd_curr:.1%}` / `{dd_max:.1%}` {dd_icon}\n"

        margin_icon = "🔴" if margin_curr > margin_max else "🟢"
        margin_stat = f"• Margin Utilization: `{margin_curr:.1%}` / `{margin_max:.1%}` {margin_icon}\n"

        trades_curr = p.daily_trades_count
        trades_max = config.max_daily_trades
        trades_icon = "🔴" if trades_curr >= trades_max else "🟢"
        trades_stat = f"• Daily Trade Cap: `{trades_curr}` / `{trades_max}` {trades_icon}\n"

        open_cnt = len(p.open_positions)
        pos_stat = f"• Max Concurrent Positions: `{open_cnt}` / `{config.top_n_portfolio_size}`\n\n"

        status_text = "🟢 ALL SYSTEMS HEALTHY" if passed else f"🔴 TRIPPED: {', '.join(reasons)}"
        overall_stat = f"Status: *{status_text}*"

        return (
            "🛡️ *Circuit Breaker Risk Ceilings*\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"{dd_stat}{margin_stat}{trades_stat}{pos_stat}{overall_stat}"
        )

    def _cmd_close_position(self, symbol: str) -> str:
        if not self.orchestrator:
            return "⚠️ Orchestrator not connected."

        if symbol not in self.orchestrator.portfolio.open_positions:
            return f"⚠️ No open position found for `{symbol}`."

        pos = self.orchestrator.portfolio.open_positions[symbol]
        del self.orchestrator.portfolio.open_positions[symbol]
        self.orchestrator.active_opportunities.pop(symbol, None)

        return f"✅ Position `{symbol}` ({pos.direction.value}) successfully closed."

    def _cmd_emergency_stop(self) -> str:
        if not self.orchestrator:
            return "⚠️ Orchestrator not connected."

        closed_cnt = len(self.orchestrator.portfolio.open_positions)
        self.orchestrator.portfolio.open_positions.clear()
        self.orchestrator.active_opportunities.clear()

        return (
            "🚨 *EMERGENCY STOP TRIGGERED*\n"
            "━━━━━━━━━━━━━━━━━━━━━━\n"
            f"Closed `{closed_cnt}` active positions.\n"
            "Scanning halted and all orders flushed."
        )

    def format_alert_message(
        self,
        alert_type: AlertType,
        title: str,
        message: str,
        metadata: dict[str, Any] | None = None,
    ) -> str:
        """Formats an alert into rich Telegram Markdown."""
        emoji_map = {
            AlertType.TRADE_OPENED: "🚀",
            AlertType.TRADE_CLOSED: "🏁",
            AlertType.CIRCUIT_BREAKER_TRIPPED: "🚨",
            AlertType.INVALIDATION_TRIGGERED: "⚠️",
            AlertType.REGIME_SHIFT: "🔄",
        }
        emoji = emoji_map.get(alert_type, "📢")

        text = f"{emoji} *{title}*\n━━━━━━━━━━━━━━━━━━━━━━\n{message}"
        if metadata:
            meta_lines = [f"• `{k}`: {v}" for k, v in metadata.items()]
            text += "\n\n" + "\n".join(meta_lines)
        return text

    def poll_updates_once(self) -> list[dict[str, Any]]:
        """Polls for new messages via getUpdates."""
        if not self.token:
            return []

        try:
            resp = requests.get(
                f"{self.bot_url}/getUpdates",
                params={"offset": self.last_update_id + 1, "timeout": 2},
                timeout=5.0,
            )
            if resp.status_code == 200:
                data = resp.json()
                updates = data.get("result", [])
                for u in updates:
                    update_id = u.get("update_id", 0)
                    if update_id > self.last_update_id:
                        self.last_update_id = update_id

                    msg = u.get("message", {})
                    text = msg.get("text", "")
                    chat_id = str(msg.get("chat", {}).get("id", ""))
                    if text and chat_id:
                        response_text = self.handle_command(text, chat_id=chat_id)
                        self.send_message(response_text, chat_id=chat_id)
                return updates
        except Exception as exc:  # noqa: BLE001
            logger.debug("Telegram polling error: %s", exc)

        return []
