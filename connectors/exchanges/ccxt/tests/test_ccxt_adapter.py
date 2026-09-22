"""Tests for the generic CCXT venue connector (no network, no credentials)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from sisera_ccxt import CCXTVenueAdapter, ConnectorStatus, VenueUnavailable
from sisera_domain import Asset, Order, OrderSide, OrderType


class FakeCCXTExchange:
    def fetch_ticker(self, symbol: str) -> dict:
        return {"symbol": symbol, "bid": 63999.0, "ask": 64001.0, "last": 64000.0}

    def fetch_ohlcv(self, symbol: str, timeframe: str = "1h", limit: int = 100) -> list:
        return [[1700000000000, 63900.0, 64100.0, 63800.0, 64000.0, 123.4]]


class FailingExchange:
    def fetch_ticker(self, symbol: str) -> dict:
        raise ConnectionError("offline")

    def fetch_ohlcv(self, symbol: str, timeframe: str = "1h", limit: int = 100) -> list:
        raise ConnectionError("offline")


def _adapter(exchange=None, enabled: bool = True) -> CCXTVenueAdapter:
    return CCXTVenueAdapter(exchange or FakeCCXTExchange(), venue_id="binance", enabled=enabled)


def test_disabled_by_default() -> None:
    adapter = CCXTVenueAdapter(FakeCCXTExchange(), venue_id="binance", enabled=False)
    assert adapter.status == ConnectorStatus.DISABLED
    with pytest.raises(VenueUnavailable):
        adapter.get_ticker_events("BTC/USDT", "binance_btc_spot")


def test_ticker_normalizes() -> None:
    bba, ref = _adapter().get_ticker_events("BTC/USDT", "binance_btc_spot")
    assert bba.bid_price == Decimal("63999.0")
    assert bba.ask_price == Decimal("64001.0")
    assert ref.reference_price == Decimal("64000.0")


def test_candles_normalize() -> None:
    candles = _adapter().get_candles("BTC/USDT", "binance_btc_spot", timeframe="1h", limit=1)
    assert len(candles) == 1
    assert candles[0].close == Decimal("64000.0")
    assert candles[0].source_timestamp_ms == 1700000000000


def test_upstream_failure_is_unavailable_not_fake() -> None:
    adapter = CCXTVenueAdapter(FailingExchange(), venue_id="binance", enabled=True)
    with pytest.raises(VenueUnavailable):
        adapter.get_ticker_events("BTC/USDT", "x")


def test_paper_place_order() -> None:
    order = Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="binance_btc_spot",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("0.1"),
        account_id="a",
        portfolio_id="p",
    )
    filled = _adapter().place_order(order, Decimal("64000"))
    assert filled.filled_quantity == Decimal("0.1")


def test_live_balance_raises() -> None:
    with pytest.raises(VenueUnavailable):
        _adapter().get_balance(Asset("USDT"))
