"""Tests for the Bybit venue connector (spec §10, ADR-010).

Uses a fake market-data client (no network). Verifies that live data normalizes into
canonical events, and that synthetic/offline data is refused (never silently faked).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from decimal import Decimal

import pytest
from sisera_bybit import BybitVenueAdapter, ConnectorStatus, VenueUnavailable
from sisera_domain import Order, OrderSide, OrderType
from sisera_domain.execution import PaperExecutionEngine


@dataclass
class FakeTicker:
    symbol: str = "BTCUSDT"
    last_price: float = 64250.5
    mark_price: float = 64251.0
    index_price: float = 64240.0
    funding_rate: float = 0.00015
    open_interest: float = 1234567.0
    bid_price: float = 64250.0
    ask_price: float = 64251.0


@dataclass
class FakeLevel:
    price: float
    size: float


@dataclass
class FakeBook:
    symbol: str = "BTCUSDT"
    bids: list = field(default_factory=lambda: [FakeLevel(64250.0, 1.5)])
    asks: list = field(default_factory=lambda: [FakeLevel(64251.0, 1.0)])
    timestamp_ms: int = 123


class FakeClient:
    def __init__(self, offline: bool = False) -> None:
        self._offline_mode = offline

    def get_ticker(self, symbol: str) -> FakeTicker:
        return FakeTicker(symbol=symbol)

    def get_orderbook(self, symbol: str, depth: int = 25) -> FakeBook:
        return FakeBook(symbol=symbol)

    def get_klines(self, symbol: str, timeframe: str, limit: int = 200) -> object:
        return []


def _order() -> Order:
    return Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="bybit_btc_perp",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("1"),
        account_id="a",
        portfolio_id="p",
    )


def test_capabilities_advertise_perps() -> None:
    adapter = BybitVenueAdapter(FakeClient())
    assert adapter.capabilities.supports_perps is True
    assert adapter.capabilities.supports_spot is False
    assert adapter.status == ConnectorStatus.PAPER_ONLY


def test_live_ticker_normalizes() -> None:
    adapter = BybitVenueAdapter(FakeClient(offline=False))
    bba, ref, funding, oi = adapter.get_ticker_events("BTCUSDT", "bybit_btc_perp")
    assert bba.bid_price == Decimal("64250.0")
    assert ref.reference_price == Decimal("64240.0")
    assert funding.funding_rate == Decimal("0.00015")
    assert oi.open_interest == Decimal("1234567.0")


def test_offline_client_refuses_to_emit_live() -> None:
    adapter = BybitVenueAdapter(FakeClient(offline=True))
    with pytest.raises(VenueUnavailable):
        adapter.get_ticker_events("BTCUSDT", "bybit_btc_perp")
    with pytest.raises(VenueUnavailable):
        adapter.get_orderbook_event("BTCUSDT", "bybit_btc_perp")


def test_orderbook_normalizes() -> None:
    adapter = BybitVenueAdapter(FakeClient())
    book = adapter.get_orderbook_event("BTCUSDT", "bybit_btc_perp", depth=5)
    assert book.bids[0] == (Decimal("64250.0"), Decimal("1.5"))
    assert book.asks[0] == (Decimal("64251.0"), Decimal("1.0"))


def test_paper_place_order_delegates() -> None:
    adapter = BybitVenueAdapter(FakeClient(), execution_engine=PaperExecutionEngine())
    filled = adapter.place_order(_order(), Decimal("60000"))
    assert filled.filled_quantity == Decimal("1")


def test_live_balance_raises_without_credentials() -> None:
    adapter = BybitVenueAdapter(FakeClient())
    from sisera_domain import Asset

    with pytest.raises(VenueUnavailable):
        adapter.get_balance(Asset("USDT"))


def test_funding_and_oi_read_from_ticker() -> None:
    adapter = BybitVenueAdapter(FakeClient())
    assert adapter.get_funding("BTCUSDT") == Decimal("0.00015")
    assert adapter.get_open_interest("BTCUSDT") == Decimal("1234567.0")
