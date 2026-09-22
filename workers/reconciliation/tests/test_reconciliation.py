"""Tests for the reconciliation worker (spec §50)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import Channel, InMemoryNotifier, NotificationService
from sisera_reconciliation import ReconciliationJob


class FakeVenue:
    def __init__(self, balances: dict[str, Decimal]) -> None:
        self._balances = balances

    def balances(self, account: str) -> dict[str, Decimal]:
        return self._balances

    def positions(self) -> dict[str, Decimal]:
        return {}


class FakeLedger:
    def __init__(self, balances: dict[str, Decimal]) -> None:
        self._balances = balances

    def balances(self, account: str) -> dict[str, Decimal]:
        return self._balances


def _job() -> tuple[ReconciliationJob, InMemoryNotifier]:
    mem = InMemoryNotifier()
    notifications = NotificationService()
    notifications.register(Channel.IN_APP, mem)
    return ReconciliationJob(notifications=notifications), mem


def test_matching_state_no_discrepancy() -> None:
    job, mem = _job()
    out = job.run("a", FakeVenue({"USDT": Decimal("100")}), FakeLedger({"USDT": Decimal("100")}))
    assert out == []
    assert mem.sent == []


def test_divergence_emits_discrepancy_and_alert() -> None:
    job, mem = _job()
    out = job.run("a", FakeVenue({"USDT": Decimal("100")}), FakeLedger({"USDT": Decimal("90")}))
    assert len(out) == 1
    assert out[0].breached is True
    assert len(mem.sent) == 1
    assert "USDT" in mem.sent[0].title


def test_ledger_state_never_mutated() -> None:
    job, _ = _job()
    ledger_balances = {"USDT": Decimal("90")}
    job.run("a", FakeVenue({"USDT": Decimal("100")}), FakeLedger(ledger_balances))
    assert ledger_balances == {"USDT": Decimal("90")}
