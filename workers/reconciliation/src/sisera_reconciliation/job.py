"""Reconciliation worker (spec §50).

Compares venue-reported balances/positions against the canonical ledger/portfolio state
on a schedule and emits discrepancy events. Never alters accounting state — discrepancies
are reported for human/automated review, not silently fixed.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from sisera_domain import (
    Category,
    Channel,
    Discrepancy,
    DiscrepancySeverity,
    Notification,
    NotificationService,
    Reconciler,
    Severity,
)


class VenueState(Protocol):
    def balances(self, account: str) -> dict[str, Decimal]: ...
    def positions(self) -> dict[str, Decimal]: ...


class LedgerState(Protocol):
    def balances(self, account: str) -> dict[str, Decimal]: ...


class ReconciliationJob:
    def __init__(
        self,
        reconciler: Reconciler | None = None,
        notifications: NotificationService | None = None,
    ) -> None:
        self._reconciler = reconciler or Reconciler()
        self._notifications = notifications or NotificationService()

    def run(
        self, account: str, venue: VenueState, ledger: LedgerState
    ) -> list[Discrepancy]:
        discrepancies = self._reconciler.reconcile_balances(
            account, venue.balances(account), ledger.balances(account)
        )
        for d in discrepancies:
            if d.severity in {DiscrepancySeverity.WARNING, DiscrepancySeverity.CRITICAL}:
                severity = (
                    Severity.WARNING
                    if d.severity == DiscrepancySeverity.WARNING
                    else Severity.CRITICAL
                )
                self._notifications.notify(
                    Notification(
                        notification_id=f"recon_{account}_{d.asset}",
                        category=Category.SYSTEM,
                        severity=severity,
                        title=f"Reconciliation discrepancy: {account}/{d.asset}",
                        body=f"venue={d.venue_value} ledger={d.ledger_value} diff={d.difference}",
                        channels=(Channel.IN_APP,),
                        dedup_key=f"recon_{account}_{d.asset}",
                    )
                )
        return discrepancies
