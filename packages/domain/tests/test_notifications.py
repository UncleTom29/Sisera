"""Tests for notifications (spec §48)."""

from __future__ import annotations

from sisera_domain import (
    Category,
    Channel,
    InMemoryNotifier,
    Notification,
    NotificationService,
    Severity,
)


def _notification(**overrides: object) -> Notification:
    base: dict[str, object] = {
        "notification_id": "n1",
        "category": Category.RISK,
        "severity": Severity.CRITICAL,
        "title": "Margin high",
        "channels": (Channel.IN_APP,),
    }
    base.update(overrides)
    return Notification(**base)  # type: ignore[arg-type]


def test_fan_out_to_registered_backend() -> None:
    service = NotificationService()
    mem = InMemoryNotifier()
    service.register(Channel.IN_APP, mem)
    assert service.notify(_notification()) is True
    assert len(mem.sent) == 1


def test_dedup_suppresses_repeat() -> None:
    service = NotificationService(dedup_window_ms=60_000)
    mem = InMemoryNotifier()
    service.register(Channel.IN_APP, mem)
    first = _notification(dedup_key="margin_pf1", timestamp_ms=0)
    second = _notification(notification_id="n2", dedup_key="margin_pf1", timestamp_ms=30_000)
    assert service.notify(first) is True
    assert service.notify(second) is False
    assert len(mem.sent) == 1


def test_dedup_expires_after_window() -> None:
    service = NotificationService(dedup_window_ms=60_000)
    mem = InMemoryNotifier()
    service.register(Channel.IN_APP, mem)
    first = _notification(dedup_key="k", timestamp_ms=0)
    later = _notification(notification_id="n2", dedup_key="k", timestamp_ms=120_000)
    assert service.notify(first) is True
    assert service.notify(later) is True
    assert len(mem.sent) == 2


def test_unregistered_channel_is_skipped() -> None:
    service = NotificationService()
    # No backends registered; notify returns True (accepted) but delivers nowhere.
    assert service.notify(_notification(channels=(Channel.PUSH,))) is True


def test_categories_and_severities_cover_spec() -> None:
    assert {c.value for c in Category} == {
        "ORDER", "FILL", "RISK", "MARGIN", "LIQUIDATION", "AGENT",
        "MARKET", "NEWS", "PORTFOLIO", "SYSTEM", "SECURITY",
    }
