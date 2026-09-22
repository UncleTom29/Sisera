"""Tests for the Polymarket connector (no network, no credentials)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from poly_fixtures import FakePolymarketClient, gamma_event, gamma_market
from sisera_domain import MarketKind, MarketStatus
from sisera_polymarket import ConnectorStatus, PolymarketVenueAdapter, VenueUnavailable


def _adapter(enabled: bool = True) -> PolymarketVenueAdapter:
    return PolymarketVenueAdapter(FakePolymarketClient(), enabled=enabled)


def test_disabled_by_default() -> None:
    adapter = PolymarketVenueAdapter(FakePolymarketClient(), enabled=False)
    assert adapter.status == ConnectorStatus.DISABLED
    with pytest.raises(VenueUnavailable):
        adapter.list_markets()


def test_gamma_row_maps_to_canonical_market() -> None:
    market = _adapter().to_prediction_market(gamma_market())
    assert market.kind == MarketKind.BINARY
    assert market.status == MarketStatus.OPEN
    assert market.total_probability() == Decimal("1.00")
    assert market.outcomes[0].label == "Yes"
    assert market.outcomes[0].probability == Decimal("0.62")
    assert market.liquidity == Decimal("250000")


def test_gamma_event_maps_to_prediction_event() -> None:
    event = _adapter().to_prediction_event(gamma_event())
    assert event.question == "June CPI"
    assert event.category == "Economics"


def test_list_markets() -> None:
    markets = _adapter().list_markets()
    assert len(markets) == 1
    assert markets[0].market_id == "12345"


def test_price_updates_emit_probabilities() -> None:
    market = _adapter().to_prediction_market(gamma_market())
    updates = _adapter().price_updates(market)
    assert len(updates) == 2
    assert updates[0].probability == Decimal("0.62")
    assert updates[0].instrument_id == "12345"


def test_place_order_raises_without_auth() -> None:
    with pytest.raises(VenueUnavailable):
        _adapter().place_order()
