"""Tests for the Solana DEX connector (no network, no credentials, no signing)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_dex_solana import ConnectorStatus, SolanaVenueAdapter, VenueUnavailable


class FakeQuoteClient:
    def quote(self, input_mint: str, output_mint: str, amount: str) -> dict:
        return {"outAmount": "990000", "priceImpact": "-0.1", "router": "metis"}


def test_disabled_by_default() -> None:
    adapter = SolanaVenueAdapter(FakeQuoteClient(), enabled=False)
    assert adapter.status == ConnectorStatus.DISABLED
    with pytest.raises(VenueUnavailable):
        adapter.quote("SOL", "USDC", Decimal("1000000"))


def test_quote_normalizes() -> None:
    quote = SolanaVenueAdapter(FakeQuoteClient(), enabled=True).quote(
        "SOL", "USDC", Decimal("1000000")
    )
    assert quote.out_amount == Decimal("990000")
    assert quote.price_impact_pct == Decimal("-0.1")
    assert quote.router == "metis"


def test_execute_swap_raises() -> None:
    with pytest.raises(VenueUnavailable):
        SolanaVenueAdapter(FakeQuoteClient(), enabled=True).execute_swap()
