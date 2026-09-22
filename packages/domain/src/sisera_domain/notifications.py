"""Notifications (spec §48).

Channel abstraction (in-app, push, email, Telegram, webhook) with alert categories,
severity, and deduplication. Delivery backends are pluggable; this module provides the
domain model plus in-memory/log backends. Push/email/Telegram backends require credentials
and are pending.
"""

from __future__ import annotations

import logging
import time
from enum import StrEnum
from typing import Protocol

from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)


class Channel(StrEnum):
    IN_APP = "IN_APP"
    PUSH = "PUSH"
    EMAIL = "EMAIL"
    TELEGRAM = "TELEGRAM"
    WEBHOOK = "WEBHOOK"


class Category(StrEnum):
    ORDER = "ORDER"
    FILL = "FILL"
    RISK = "RISK"
    MARGIN = "MARGIN"
    LIQUIDATION = "LIQUIDATION"
    AGENT = "AGENT"
    MARKET = "MARKET"
    NEWS = "NEWS"
    PORTFOLIO = "PORTFOLIO"
    SYSTEM = "SYSTEM"
    SECURITY = "SECURITY"


class Severity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class Notification(BaseModel):
    model_config = ConfigDict(frozen=True)

    notification_id: str
    category: Category
    severity: Severity
    title: str
    body: str = ""
    channels: tuple[Channel, ...] = Field(default_factory=lambda: (Channel.IN_APP,))
    dedup_key: str | None = None
    timestamp_ms: int = Field(default_factory=lambda: int(time.time() * 1000))
    metadata: dict = Field(default_factory=dict)


class Notifier(Protocol):
    def send(self, notification: Notification) -> None: ...


class InMemoryNotifier:
    """Test/development backend that records notifications."""

    def __init__(self) -> None:
        self.sent: list[Notification] = []

    def send(self, notification: Notification) -> None:
        self.sent.append(notification)


class LogNotifier:
    """Backend that logs notifications (safe default, no credentials needed)."""

    def send(self, notification: Notification) -> None:
        logger.info(
            "[%s/%s] %s: %s",
            notification.category.value,
            notification.severity.value,
            notification.title,
            notification.body,
        )


class NotificationService:
    """Deduplicating fan-out to channel backends."""

    def __init__(self, dedup_window_ms: int = 300_000) -> None:
        self._backends: dict[Channel, Notifier] = {}
        self._seen: dict[str, int] = {}
        self._dedup_window_ms = dedup_window_ms

    def register(self, channel: Channel, notifier: Notifier) -> None:
        self._backends[channel] = notifier

    def notify(self, notification: Notification) -> bool:
        """Send unless an identical `dedup_key` was sent within the window. Returns
        whether the notification was actually delivered."""
        now = notification.timestamp_ms
        if notification.dedup_key is not None:
            last = self._seen.get(notification.dedup_key)
            if last is not None and now - last < self._dedup_window_ms:
                return False
            self._seen[notification.dedup_key] = now
        for channel in notification.channels:
            backend = self._backends.get(channel)
            if backend is not None:
                backend.send(notification)
        return True
