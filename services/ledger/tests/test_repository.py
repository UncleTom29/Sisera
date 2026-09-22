"""Tests for the ledger repository (SQLite-backed, exercises the same code path as Postgres)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_domain import EntryType, LedgerEntry, Posting
from sisera_ledger import Base, LedgerRepository, create_db_engine, session_factory
from sqlalchemy.orm import Session


@pytest.fixture
def session() -> Session:
    engine = create_db_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    session = session_factory(engine)()
    try:
        yield session
    finally:
        session.close()


def _entry(entry_id: str, amount: str = "1000") -> LedgerEntry:
    return LedgerEntry(
        entry_id=entry_id,
        entry_type=EntryType.DEPOSIT,
        timestamp_ms=0,
        postings=(
            Posting("cash", "USDT", amount),
            Posting("external", "USDT", -Decimal(amount)),
        ),
    )


def test_post_and_get_round_trip(session: Session) -> None:
    repo = LedgerRepository(session)
    repo.post(_entry("e1", "1000"))
    session.commit()

    loaded = repo.get("e1")
    assert loaded is not None
    assert loaded.entry_id == "e1"
    assert loaded.entry_type == EntryType.DEPOSIT
    assert loaded.postings[0].amount == Decimal("1000")
    assert loaded.postings[1].amount == Decimal("-1000")


def test_post_is_idempotent(session: Session) -> None:
    repo = LedgerRepository(session)
    repo.post(_entry("e1", "1000"))
    repo.post(_entry("e1", "1000"))  # duplicate does not double-book
    session.commit()
    assert repo.balance("cash", "USDT") == Decimal("1000")


def test_balance_computation_via_sql(session: Session) -> None:
    repo = LedgerRepository(session)
    repo.post(_entry("e1", "1000"))
    repo.post(
        LedgerEntry(
            entry_id="e2",
            entry_type=EntryType.WITHDRAWAL,
            timestamp_ms=1,
            postings=(
                Posting("cash", "USDT", "-400"),
                Posting("external", "USDT", "400"),
            ),
        )
    )
    session.commit()
    assert repo.balance("cash", "USDT") == Decimal("600")
    assert repo.balance("external", "USDT") == Decimal("-600")


def test_balances_by_account(session: Session) -> None:
    repo = LedgerRepository(session)
    repo.post(
        LedgerEntry(
            entry_id="e1",
            entry_type=EntryType.DEPOSIT,
            timestamp_ms=0,
            postings=(
                Posting("cash", "USDT", "500"),
                Posting("cash", "BTC", "1"),
                Posting("external", "USDT", "-500"),
                Posting("external", "BTC", "-1"),
            ),
        )
    )
    session.commit()
    assert repo.balances("cash") == {"USDT": Decimal("500"), "BTC": Decimal("1")}


def test_decimal_precision_is_exact(session: Session) -> None:
    repo = LedgerRepository(session)
    repo.post(_entry("e1", "0.1"))
    repo.post(_entry("e2", "0.2"))
    session.commit()
    assert repo.balance("cash", "USDT") == Decimal("0.3")


def test_multi_asset_entry_persists(session: Session) -> None:
    repo = LedgerRepository(session)
    repo.post(
        LedgerEntry(
            entry_id="e3",
            entry_type=EntryType.TRANSFER,
            timestamp_ms=0,
            postings=(
                Posting("a", "BTC", "1"),
                Posting("b", "BTC", "-1"),
                Posting("a", "USDT", "-100"),
                Posting("b", "USDT", "100"),
            ),
        )
    )
    session.commit()
    assert repo.balance("a", "BTC") == Decimal("1")
    assert repo.balance("b", "USDT") == Decimal("100")


def test_list_entries_ordered_desc(session: Session) -> None:
    repo = LedgerRepository(session)
    repo.post(_entry("older", "1"))
    repo.post(
        LedgerEntry(
            entry_id="newer",
            entry_type=EntryType.DEPOSIT,
            timestamp_ms=100,
            postings=(Posting("cash", "USDT", "2"), Posting("external", "USDT", "-2")),
        )
    )
    session.commit()
    entries = repo.list_entries()
    assert [e.entry_id for e in entries] == ["newer", "older"]
