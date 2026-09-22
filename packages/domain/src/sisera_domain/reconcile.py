"""Venue reconciliation (spec §50).

Compares venue-reported state (cash, balances, positions, orders, fills, funding, fees,
ledger) against Sisera's canonical records and produces discrepancy events. Reconciliation
never silently alters accounting state to make itself pass.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict


class DiscrepancySeverity(StrEnum):
    INFO = "INFO"
    WARNING = "WARNING"
    CRITICAL = "CRITICAL"


class Discrepancy(BaseModel):
    model_config = ConfigDict(frozen=True)

    account: str
    asset: str
    field: str  # e.g. "balance", "position_quantity", "fill_count"
    venue_value: Decimal
    ledger_value: Decimal
    tolerance: Decimal

    @property
    def difference(self) -> Decimal:
        return self.venue_value - self.ledger_value

    @property
    def breached(self) -> bool:
        return abs(self.difference) > self.tolerance

    @property
    def severity(self) -> DiscrepancySeverity:
        if not self.breached:
            return DiscrepancySeverity.INFO
        rel = abs(self.difference) / max(abs(self.ledger_value), Decimal("1"))
        if rel > Decimal("0.05"):
            return DiscrepancySeverity.CRITICAL
        return DiscrepancySeverity.WARNING


class Reconciler:
    """Compares venue snapshots against canonical state."""

    def __init__(self, tolerance: Decimal = Decimal("0.0001")) -> None:
        self.tolerance = tolerance

    def reconcile_balances(
        self, account: str, venue: dict[str, Decimal], ledger: dict[str, Decimal]
    ) -> list[Discrepancy]:
        discrepancies: list[Discrepancy] = []
        for asset in sorted(set(venue) | set(ledger)):
            venue_v = venue.get(asset, Decimal("0"))
            ledger_v = ledger.get(asset, Decimal("0"))
            d = Discrepancy(
                account=account,
                asset=asset,
                field="balance",
                venue_value=venue_v,
                ledger_value=ledger_v,
                tolerance=self.tolerance,
            )
            if d.breached:
                discrepancies.append(d)
        return discrepancies

    def reconcile_positions(
        self,
        venue: dict[str, Decimal],
        portfolio: dict[str, Decimal],
    ) -> list[Discrepancy]:
        discrepancies: list[Discrepancy] = []
        for instrument in sorted(set(venue) | set(portfolio)):
            venue_v = venue.get(instrument, Decimal("0"))
            ledger_v = portfolio.get(instrument, Decimal("0"))
            d = Discrepancy(
                account="portfolio",
                asset=instrument,
                field="position_quantity",
                venue_value=venue_v,
                ledger_value=ledger_v,
                tolerance=self.tolerance,
            )
            if d.breached:
                discrepancies.append(d)
        return discrepancies
