"""Tests for the EVM DEX connector (no network, no credentials, no signing)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_dex_evm import ConnectorStatus, EVMVenueAdapter, VenueUnavailable


class FakeQuoteClient:
    def quote(self, src: str, dst: str, amount: str) -> dict:
        return {"dstAmount": "995000", "gas": "150000"}


def test_disabled_by_default() -> None:
    adapter = EVMVenueAdapter(FakeQuoteClient(), enabled=False)
    assert adapter.status == ConnectorStatus.DISABLED
    with pytest.raises(VenueUnavailable):
        adapter.quote("USDC", "WETH", Decimal("1000000"))


def test_quote_normalizes() -> None:
    quote = EVMVenueAdapter(FakeQuoteClient(), enabled=True).quote(
        "USDC", "WETH", Decimal("1000000")
    )
    assert quote.dst_amount == Decimal("995000")
    assert quote.effective_price == Decimal("0.995")
    assert quote.estimated_gas == Decimal("150000")


def test_execute_swap_raises() -> None:
    with pytest.raises(VenueUnavailable):
        EVMVenueAdapter(FakeQuoteClient(), enabled=True).execute_swap()
