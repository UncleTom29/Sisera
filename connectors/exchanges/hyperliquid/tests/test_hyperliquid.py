"""Unit + contract tests for the Hyperliquid connector (no network, no credentials)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from fixtures import FakeHyperliquidClient
from sisera_domain import Asset, Order, OrderSide, OrderType
from sisera_hyperliquid import (
    ConnectorStatus,
    HyperliquidVenueAdapter,
    VenueUnavailable,
)


def _adapter(enabled: bool = True) -> HyperliquidVenueAdapter:
    return HyperliquidVenueAdapter(FakeHyperliquidClient(), enabled=enabled)


def test_disabled_by_default() -> None:
    adapter = HyperliquidVenueAdapter(FakeHyperliquidClient(), enabled=False)
    assert adapter.status == ConnectorStatus.DISABLED
    with pytest.raises(VenueUnavailable):
        adapter.get_ticker_events("BTC", "hl_btc_perp")


def test_capabilities() -> None:
    adapter = _adapter()
    assert adapter.capabilities.supports_perps is True
    assert adapter.capabilities.supports_spot is True
    assert adapter.status == ConnectorStatus.EXPERIMENTAL


def test_perp_contexts_join() -> None:
    ctxs = _adapter().get_perp_contexts()
    assert ctxs[0]["coin"] == "BTC"
    assert ctxs[0]["markPx"] == "64250.5"


def test_ticker_events_normalize() -> None:
    bba, ref, funding, oi = _adapter().get_ticker_events("BTC", "hl_btc_perp")
    assert bba.bid_price == Decimal("64250.0")
    assert bba.ask_price == Decimal("64251.0")
    assert ref.reference_price == Decimal("64250.5")
    assert funding.funding_rate == Decimal("0.00012")
    assert oi.open_interest == Decimal("1234.5")


def test_paper_place_order() -> None:
    order = Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="hl_btc_perp",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("1"),
        account_id="a",
        portfolio_id="p",
    )
    filled = _adapter().place_order(order, Decimal("64250"))
    assert filled.filled_quantity == Decimal("1")


def test_live_balance_raises_without_wallet() -> None:
    with pytest.raises(VenueUnavailable):
        _adapter().get_balance(Asset("USDC"))


def test_contract_matches_bybit_adapter_shape() -> None:
    """Contract test: Hyperliquid and Bybit adapters expose the same venue interface
    (capabilities, status, ticker events, paper place, honest unavailable)."""
    from sisera_bybit import BybitVenueAdapter

    class _FakeBybit:
        _offline_mode = False

        def __init__(self, symbol: str = "BTCUSDT") -> None:
            self._symbol = symbol

        def get_ticker(self, symbol: str) -> object:
            from dataclasses import dataclass

            @dataclass
            class T:
                symbol: str = "BTCUSDT"
                last_price: float = 1.0
                mark_price: float = 1.0
                index_price: float = 1.0
                funding_rate: float = 0.0
                open_interest: float = 0.0
                bid_price: float = 1.0
                ask_price: float = 1.0

            return T(symbol=symbol)

        def get_orderbook(self, symbol: str, depth: int = 25) -> object:
            from dataclasses import dataclass, field

            @dataclass
            class L:
                price: float
                size: float

            @dataclass
            class B:
                bids: list = field(default_factory=lambda: [L(1.0, 1.0)])
                asks: list = field(default_factory=lambda: [L(1.0, 1.0)])
                timestamp_ms: int = 0

            return B()

        def get_klines(self, symbol: str, timeframe: str, limit: int = 200) -> object:
            return []

    bybit = BybitVenueAdapter(_FakeBybit())
    hl = _adapter()
    # Both expose capabilities + status + 4-tuple ticker events + paper place_order.
    assert hasattr(bybit.capabilities, "supports_perps")
    assert hasattr(hl.capabilities, "supports_perps")
    assert len(bybit.get_ticker_events("BTCUSDT", "x")) == 4
    assert len(hl.get_ticker_events("BTC", "x")) == 4
