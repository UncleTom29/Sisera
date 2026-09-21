"""Alerting & Notifications. See SCOPE.md §14.

Lightweight webhook / logging notification system for:
- Trade execution
- Stop loss / take profit triggers
- Circuit breaker trips
- Invalidation condition triggers
- Regime shifts
"""

from __future__ import annotations

import logging
from enum import StrEnum
from typing import Any

import requests

from sisera.config import config

logger = logging.getLogger(__name__)


class AlertType(StrEnum):
    TRADE_OPENED = "TRADE_OPENED"
    TRADE_CLOSED = "TRADE_CLOSED"
    CIRCUIT_BREAKER_TRIPPED = "CIRCUIT_BREAKER_TRIPPED"
    INVALIDATION_TRIGGERED = "INVALIDATION_TRIGGERED"
    REGIME_SHIFT = "REGIME_SHIFT"
    BREAKING_NEWS = "BREAKING_NEWS"
    HIGH_SEVERITY_EVENT = "HIGH_SEVERITY_EVENT"


class AlertManager:
    """Dispatches real-time structured alerts via logging, Telegram, and optional webhook."""

    def __init__(
        self,
        webhook_url: str | None = None,
        telegram_token: str | None = None,
        telegram_chat_id: str | None = None,
    ) -> None:
        self.webhook_url = webhook_url
        self.telegram_token = telegram_token or config.telegram_bot_token
        self.telegram_chat_id = telegram_chat_id or config.telegram_chat_id
        self.sent_alerts: list[dict[str, Any]] = []

    def send_alert(
        self,
        alert_type: AlertType,
        title: str,
        message: str,
        metadata: dict[str, Any] | None = None,
    ) -> bool:
        alert_payload = {
            "type": alert_type.value,
            "title": title,
            "message": message,
            "metadata": metadata or {},
        }
        self.sent_alerts.append(alert_payload)

        # Always log structured alert
        log_level = logging.WARNING if alert_type == AlertType.CIRCUIT_BREAKER_TRIPPED else logging.INFO
        logger.log(
            log_level,
            "[ALERT %s] %s: %s | metadata=%s",
            alert_type.value,
            title,
            message,
            metadata,
        )

        # Telegram dispatch if configured
        if self.telegram_token and self.telegram_chat_id:
            try:
                from sisera.interfaces.telegram.bot import SiseraTelegramBot

                bot = SiseraTelegramBot(token=self.telegram_token, chat_id=self.telegram_chat_id)
                formatted_msg = bot.format_alert_message(alert_type, title, message, metadata)
                bot.send_message(formatted_msg)
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to dispatch Telegram alert: %s", exc)

        # Webhook dispatch if configured
        if self.webhook_url:
            try:
                resp = requests.post(
                    self.webhook_url,
                    json={"text": f"*{title}*\n{message}\n`{metadata}`"},
                    timeout=5.0,
                )
                return resp.status_code < 400
            except Exception as exc:  # noqa: BLE001
                logger.warning("Failed to dispatch alert webhook: %s", exc)
                return False

        return True
