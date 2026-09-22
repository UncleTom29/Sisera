"""Property-based and unit tests for the double-entry financial ledger (ADR-007)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st
from pydantic import ValidationError
from sisera_domain import EntryType, Ledger, LedgerEntry, Posting


def _entry(entry_id: str, entry_type: EntryType, postings: list[Posting]) -> LedgerEntry:
    return LedgerEntry(
        entry_id=entry_id,
        entry_type=entry_type,
        timestamp_ms=0,
        postings=tuple(postings),
    )


def test_balanced_deposit_updates_balance() -> None:
    ledger = Ledger()
    ledger.post(
        _entry(
            "e1",
            EntryType.DEPOSIT,
            [
                Posting("cash", "USDT", "1000"),
                Posting("external", "USDT", "-1000"),
            ],
        )
    )
    assert ledger.balance("cash", "USDT") == Decimal("1000")
    assert ledger.balance("external", "USDT") == Decimal("-1000")


def test_unbalanced_entry_rejected() -> None:
    with pytest.raises(ValueError):
        _entry(
            "e1",
            EntryType.DEPOSIT,
            [
                Posting("cash", "USDT", "1000"),
                Posting("external", "USDT", "-500"),
            ],
        )


def test_empty_entry_rejected() -> None:
    with pytest.raises(ValueError):
        _entry("e1", EntryType.DEPOSIT, [])


def test_duplicate_entry_id_rejected() -> None:
    ledger = Ledger()
    e = _entry(
        "e1",
        EntryType.DEPOSIT,
        [Posting("cash", "USDT", "1000"), Posting("external", "USDT", "-1000")],
    )
    ledger.post(e)
    with pytest.raises(ValueError):
        ledger.post(e)


def test_multi_asset_entry_balances_per_asset() -> None:
    # A transfer moving two assets at once, each balanced independently.
    entry = _entry(
        "e2",
        EntryType.TRANSFER,
        [
            Posting("acct_a", "BTC", "1"),
            Posting("acct_b", "BTC", "-1"),
            Posting("acct_a", "USDT", "-100"),
            Posting("acct_b", "USDT", "100"),
        ],
    )
    Ledger().post(entry)  # must not raise


def test_multi_asset_entry_cross_asset_imbalance_rejected() -> None:
    with pytest.raises(ValueError):
        _entry(
            "e2",
            EntryType.TRANSFER,
            [
                Posting("acct_a", "BTC", "1"),
                Posting("acct_b", "BTC", "-1"),
                Posting("acct_a", "USDT", "-100"),
                # missing the +100 USDT counterpart
            ],
        )


def test_compensating_correction_reverses_balance() -> None:
    ledger = Ledger()
    ledger.post(
        _entry(
            "e1",
            EntryType.DEPOSIT,
            [Posting("cash", "USDT", "1000"), Posting("external", "USDT", "-1000")],
        )
    )
    # Correct the deposit by reversing it with a compensating CORRECTION entry.
    ledger.post(
        _entry(
            "e2",
            EntryType.CORRECTION,
            [Posting("cash", "USDT", "-1000"), Posting("external", "USDT", "1000")],
        )
    )
    assert ledger.balance("cash", "USDT") == Decimal("0")


def test_entries_are_immutable_after_posting() -> None:
    ledger = Ledger()
    e = _entry(
        "e1",
        EntryType.DEPOSIT,
        [Posting("cash", "USDT", "1000"), Posting("external", "USDT", "-1000")],
    )
    ledger.post(e)
    with pytest.raises(ValidationError):
        e.postings = (Posting("cash", "USDT", "1"), Posting("external", "USDT", "-1"))  # type: ignore[misc]


@given(
    st.lists(
        st.decimals(min_value=-1_000_000, max_value=1_000_000, places=4),
        min_size=1,
        max_size=20,
    )
)
def test_balance_is_sum_independent_of_order(amounts: list[Decimal]) -> None:
    """Posting a sequence of deposits and summing the balance equals the sum of amounts,
    regardless of the order the entries are posted (associativity)."""
    ledger = Ledger()
    expected = Decimal("0")
    for i, amount in enumerate(amounts):
        ledger.post(
            _entry(
                f"e{i}",
                EntryType.DEPOSIT,
                [Posting("cash", "USDT", amount), Posting("external", "USDT", -amount)],
            )
        )
        expected += amount
    assert ledger.balance("cash", "USDT") == expected
    assert ledger.balance("external", "USDT") == -expected


@given(st.decimals(min_value=0, max_value=1_000_000, places=4))
def test_deposit_then_withdraw_nets_zero(amount: Decimal) -> None:
    ledger = Ledger()
    ledger.post(
        _entry(
            "d",
            EntryType.DEPOSIT,
            [Posting("cash", "USDT", amount), Posting("external", "USDT", -amount)],
        )
    )
    ledger.post(
        _entry(
            "w",
            EntryType.WITHDRAWAL,
            [Posting("cash", "USDT", -amount), Posting("external", "USDT", amount)],
        )
    )
    assert ledger.balance("cash", "USDT") == Decimal("0")


def test_asset_balances_aggregates_by_code() -> None:
    ledger = Ledger()
    ledger.post(
        _entry(
            "e1",
            EntryType.DEPOSIT,
            [Posting("cash", "USDT", "500"), Posting("external", "USDT", "-500")],
        )
    )
    ledger.post(
        _entry(
            "e2",
            EntryType.DEPOSIT,
            [Posting("cash", "BTC", "1"), Posting("external", "BTC", "-1")],
        )
    )
    balances = ledger.asset_balances("cash")
    assert balances == {"USDT": Decimal("500"), "BTC": Decimal("1")}
