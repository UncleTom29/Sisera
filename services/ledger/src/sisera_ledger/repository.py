"""Ledger repository: persists the canonical double-entry ledger to SQL (ADR-007).

Bridges the pure domain objects (`sisera_domain.ledger`) to the ORM rows. Enforces
idempotency by `entry_id`, computes balances via SQL aggregation (not in-memory), and
never mutates a posted entry.
"""

from __future__ import annotations

from decimal import Decimal

from sisera_domain.ledger import EntryType, LedgerEntry, Posting
from sisera_domain.money import Asset
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from sisera_ledger.models import LedgerEntryRow, PostingRow


def entry_to_row(entry: LedgerEntry) -> LedgerEntryRow:
    return LedgerEntryRow(
        entry_id=entry.entry_id,
        entry_type=entry.entry_type.value,
        timestamp_ms=entry.timestamp_ms,
        reference_id=entry.reference_id,
        metadata_json=entry.metadata or None,
        postings=[
            PostingRow(
                account=p.account,
                asset=p.asset.code,
                amount=p.amount,
            )
            for p in entry.postings
        ],
    )


def row_to_entry(row: LedgerEntryRow) -> LedgerEntry:
    return LedgerEntry(
        entry_id=row.entry_id,
        entry_type=EntryType(row.entry_type),
        timestamp_ms=row.timestamp_ms,
        reference_id=row.reference_id,
        metadata=row.metadata_json or {},
        postings=tuple(
            Posting(account=p.account, asset=Asset(p.asset), amount=Decimal(p.amount))
            for p in row.postings
        ),
    )


class LedgerRepository:
    def __init__(self, session: Session) -> None:
        self._session = session

    def post(self, entry: LedgerEntry) -> LedgerEntry:
        """Persist an entry. Returns the existing entry unchanged if `entry_id` already
        exists (idempotent — a retried post does not double-book)."""
        existing = self._session.get(LedgerEntryRow, entry.entry_id)
        if existing is not None:
            return row_to_entry(existing)
        self._session.add(entry_to_row(entry))
        try:
            self._session.flush()
        except IntegrityError:
            # Lost the idempotency race: another writer posted the same entry_id first.
            self._session.rollback()
            existing = self._session.get(LedgerEntryRow, entry.entry_id)
            if existing is None:
                raise
            return row_to_entry(existing)
        return entry

    def get(self, entry_id: str) -> LedgerEntry | None:
        row = self._session.get(LedgerEntryRow, entry_id)
        return row_to_entry(row) if row is not None else None

    def balance(self, account: str, asset: Asset | str) -> Decimal:
        code = asset.code if isinstance(asset, Asset) else Asset(asset).code
        total = Decimal("0")
        for row in self._session.scalars(
            select(PostingRow).where(
                PostingRow.account == account, PostingRow.asset == code
            )
        ):
            total += Decimal(row.amount)
        return total

    def balances(self, account: str) -> dict[str, Decimal]:
        out: dict[str, Decimal] = {}
        for row in self._session.scalars(select(PostingRow).where(PostingRow.account == account)):
            out[row.asset] = out.get(row.asset, Decimal("0")) + Decimal(row.amount)
        return out

    def list_entries(self, limit: int = 100) -> list[LedgerEntry]:
        rows = self._session.execute(
            select(LedgerEntryRow).order_by(LedgerEntryRow.timestamp_ms.desc()).limit(limit)
        ).scalars().all()
        return [row_to_entry(r) for r in rows]
