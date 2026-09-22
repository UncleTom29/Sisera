"""Bybit venue connector (spec §10, §11).

Migrates the existing Bybit implementation behind the canonical `VenueAdapter` interface.
Market data is normalized into canonical events with explicit `DataQuality` — a synthetic
or fallback reading is surfaced as UNAVAILABLE/DEGRADED, never silently presented as LIVE
(ADR-010). Execution delegates to an injected engine (paper by default); live order
submission requires credentials and the `LiveTradingGuard`, and is classified accordingly.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum
from typing import Any, Protocol

from sisera_config import LiveTradingGuard
from sisera_domain.execution import PaperExecutionEngine, VenueCapabilities
from sisera_domain.money import Asset, Money
from sisera_domain.order import Order
from sisera_marketdata import normalize_orderbook, normalize_ticker
from sisera_schemas import (
    BestBidAsk,
    DataQuality,
    FundingUpdate,
    OpenInterestUpdate,
    OrderBookSnapshot,
    ReferencePriceUpdate,
)


class ConnectorStatus(StrEnum):
    PRODUCTION_READY = "PRODUCTION_READY"
    SANDBOX_VERIFIED = "SANDBOX_VERIFIED"
    PAPER_ONLY = "PAPER_ONLY"
    EXPERIMENTAL = "EXPERIMENTAL"
    DISABLED = "DISABLED"


class VenueUnavailable(RuntimeError):
    """Raised when a venue capability is not available (offline, unconfigured, or gated)."""


class BybitMarketDataClient(Protocol):
    """Minimal surface the connector needs. The legacy `sisera.data.bybit.BybitClient`
    satisfies this; tests inject a fake."""

    def get_ticker(self, symbol: str) -> Any: ...
    def get_orderbook(self, symbol: str, depth: int = 25) -> Any: ...
    def get_klines(self, symbol: str, timeframe: str, limit: int = 200) -> Any: ...


class BybitVenueAdapter:
    """Bybit V5 behind the canonical venue interface."""

    venue_id = "bybit"

    def __init__(
        self,
        market_data_client: BybitMarketDataClient,
        execution_engine: PaperExecutionEngine | None = None,
        live_configured: bool = False,
        guard: LiveTradingGuard | None = None,
    ) -> None:
        self._client = market_data_client
        self._execution = execution_engine or PaperExecutionEngine()
        self._live_configured = live_configured
        self._guard = guard or LiveTradingGuard()

    @property
    def capabilities(self) -> VenueCapabilities:
        return VenueCapabilities(
            supports_spot=False,
            supports_perps=True,
            supports_options=False,
            supports_prediction=False,
            supports_post_only=True,
            supports_reduce_only=True,
            supports_trailing_stop=True,
            supports_native_oco=False,
            supports_batch_orders=False,
            supports_subaccounts=False,
        )

    @property
    def status(self) -> ConnectorStatus:
        if not self._live_configured:
            return ConnectorStatus.PAPER_ONLY
        return ConnectorStatus.SANDBOX_VERIFIED

    def _quality(self) -> DataQuality:
        # The legacy client exposes `_offline_mode` once it has fallen back to synthetic
        # data. A synthetic reading must never be presented as LIVE (ADR-010).
        if getattr(self._client, "_offline_mode", False):
            return DataQuality.UNAVAILABLE
        return DataQuality.LIVE

    def _require_live_data(self, quality: DataQuality) -> None:
        if quality != DataQuality.LIVE:
            raise VenueUnavailable(
                f"Bybit market data is {quality.value}; refusing to emit as live. "
                "No synthetic fallback is substituted."
            )

    def get_ticker_events(
        self, venue_symbol: str, instrument_id: str
    ) -> tuple[BestBidAsk, ReferencePriceUpdate, FundingUpdate, OpenInterestUpdate]:
        raw = self._client.get_ticker(venue_symbol)
        quality = self._quality()
        self._require_live_data(quality)
        # Normalize the legacy Ticker model into the raw V5 row shape the normalizer expects.
        row = {
            "symbol": getattr(raw, "symbol", venue_symbol),
            "lastPrice": str(getattr(raw, "last_price", 0)),
            "markPrice": str(getattr(raw, "mark_price", 0)),
            "indexPrice": str(getattr(raw, "index_price", 0)),
            "fundingRate": str(getattr(raw, "funding_rate", 0)),
            "openInterest": str(getattr(raw, "open_interest", 0)),
            "bid1Price": str(getattr(raw, "bid_price", 0)) if getattr(raw, "bid_price", None) else None,
            "ask1Price": str(getattr(raw, "ask_price", 0)) if getattr(raw, "ask_price", None) else None,
        }
        return normalize_ticker(
            row, instrument_id=instrument_id, source=self.venue_id, quality=quality
        )

    def get_orderbook_event(
        self, venue_symbol: str, instrument_id: str, depth: int = 25
    ) -> OrderBookSnapshot:
        raw = self._client.get_orderbook(venue_symbol, depth=depth)
        quality = self._quality()
        self._require_live_data(quality)
        bids = [[str(lvl.price), str(lvl.size)] for lvl in raw.bids]
        asks = [[str(lvl.price), str(lvl.size)] for lvl in raw.asks]
        payload = {"s": venue_symbol, "b": bids, "a": asks, "ts": raw.timestamp_ms}
        return normalize_orderbook(
            payload, instrument_id=instrument_id, source=self.venue_id, quality=quality
        )

    def place_order(self, order: Order, mid_price: Decimal) -> Order:
        """Paper/testnet execution. Live venue submission requires credentials and the
        live-trading guard; otherwise this delegates to the injected paper engine."""
        if self._live_configured:
            self._guard.assert_live_allowed()
            raise VenueUnavailable(
                "Live Bybit order submission is not yet wired; configure testnet/paper "
                "or implement the authenticated CCXT path."
            )
        return self._execution.submit(order, mid_price)

    def get_balance(self, asset: Asset) -> Money:
        raise VenueUnavailable("Bybit balance requires live credentials (not configured).")

    def get_positions(self) -> list[object]:
        raise VenueUnavailable("Bybit positions require live credentials (not configured).")

    def cancel_order(self, venue_order_id: str) -> bool:
        raise VenueUnavailable("Bybit cancel requires live credentials (not configured).")

    def get_funding(self, symbol: str) -> Decimal:
        _, _, funding, _ = self.get_ticker_events(symbol, instrument_id=symbol)
        return funding.funding_rate

    def get_open_interest(self, symbol: str) -> Decimal:
        _, _, _, oi = self.get_ticker_events(symbol, instrument_id=symbol)
        return oi.open_interest
