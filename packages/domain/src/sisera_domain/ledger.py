"""Double-entry financial ledger domain core (ADR-007).

This is the pure accounting model: an immutable, append-only journal of `LedgerEntry`
objects, each a balanced set of `Posting`s. Balance is computed per (account, asset).
Corrections are made via compensating entries, never by mutating a posted entry.

This module is persistence-agnostic; the `services/ledger` service will back it with
PostgreSQL and reconciliation. Orders and portfolio tables are *not* accounting — this is.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator

from sisera_domain.money import Asset


class EntryType(StrEnum):
    DEPOSIT = "DEPOSIT"
    WITHDRAWAL = "WITHDRAWAL"
    TRANSFER = "TRANSFER"
    FILL = "FILL"
    TRADING_FEE = "TRADING_FEE"
    FUNDING = "FUNDING"
    BORROW = "BORROW"
    REPAYMENT = "REPAYMENT"
    REALIZED_PNL = "REALIZED_PNL"
    SETTLEMENT = "SETTLEMENT"
    GAS = "GAS"
    BRIDGE_FEE = "BRIDGE_FEE"
    PREDICTION_SETTLEMENT = "PREDICTION_SETTLEMENT"
    CORRECTION = "CORRECTION"


class Posting(BaseModel):
    """A single leg of a ledger entry: a signed amount of one asset for one account."""

    model_config = ConfigDict(frozen=True)

    account: str
    asset: Asset
    amount: Decimal

    def __init__(self, account: str, asset: Asset | str, amount: Decimal | int | str) -> None:
        if isinstance(asset, str):
            asset = Asset(asset)
        super().__init__(account=account, asset=asset, amount=Decimal(amount))

    @field_validator("account")
    @classmethod
    def _nonempty_account(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Posting account must be a non-empty string")
        return v.strip()


class LedgerEntry(BaseModel):
    """An immutable, balanced entry. Postings must net to zero per asset."""

    model_config = ConfigDict(frozen=True)

    entry_id: str
    entry_type: EntryType
    timestamp_ms: int
    postings: tuple[Posting, ...]
    reference_id: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)

    @field_validator("postings")
    @classmethod
    def _must_be_balanced(cls, v: tuple[Posting, ...]) -> tuple[Posting, ...]:
        if not v:
            raise ValueError("A ledger entry must have at least one posting")
        per_asset: dict[Asset, Decimal] = {}
        for p in v:
            per_asset[p.asset] = per_asset.get(p.asset, Decimal("0")) + p.amount
        unbalanced = {a: s for a, s in per_asset.items() if s != 0}
        if unbalanced:
            raise ValueError(f"Unbalanced ledger entry: {unbalanced}")
        return v


class Ledger:
    """Append-only in-memory journal. Postings are validated balanced and are immutable."""

    def __init__(self) -> None:
        self._entries: list[LedgerEntry] = []
        self._ids: set[str] = set()

    @property
    def entries(self) -> tuple[LedgerEntry, ...]:
        return tuple(self._entries)

    def post(self, entry: LedgerEntry) -> LedgerEntry:
        if entry.entry_id in self._ids:
            raise ValueError(f"Duplicate ledger entry id {entry.entry_id!r}")
        self._ids.add(entry.entry_id)
        self._entries.append(entry)
        return entry

    def balance(self, account: str, asset: Asset | str) -> Decimal:
        if isinstance(asset, str):
            asset = Asset(asset)
        total = Decimal("0")
        for entry in self._entries:
            for p in entry.postings:
                if p.account == account and p.asset == asset:
                    total += p.amount
        return total

    def asset_balances(self, account: str) -> dict[str, Decimal]:
        out: dict[str, Decimal] = {}
        for entry in self._entries:
            for p in entry.postings:
                if p.account == account:
                    out[p.asset.code] = out.get(p.asset.code, Decimal("0")) + p.amount
        return out
