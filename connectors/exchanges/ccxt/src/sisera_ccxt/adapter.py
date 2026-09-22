"""Generic CCXT venue adapter (second CEX).

Wraps any CCXT exchange instance (Binance configured as the concrete second venue) behind
the canonical interface. Market data normalizes CCXT ticker/book/OHLCV into canonical
events; execution is paper unless live keys + guard are present. Disabled by default.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum
from typing import Any

from sisera_config import LiveTradingGuard
from sisera_domain.execution import PaperExecutionEngine, VenueCapabilities
from sisera_domain.money import Asset, Money
from sisera_domain.order import Order
from sisera_schemas import (
    BestBidAsk,
    Candle,
    DataQuality,
    ReferencePriceUpdate,
)


class ConnectorStatus(StrEnum):
    PRODUCTION_READY = "PRODUCTION_READY"
    SANDBOX_VERIFIED = "SANDBOX_VERIFIED"
    PAPER_ONLY = "PAPER_ONLY"
    EXPERIMENTAL = "EXPERIMENTAL"
    DISABLED = "DISABLED"


class VenueUnavailable(RuntimeError):
    pass


class CCXTVenueAdapter:
    def __init__(
        self,
        exchange: Any,
        venue_id: str,
        execution_engine: PaperExecutionEngine | None = None,
        enabled: bool = False,
        guard: LiveTradingGuard | None = None,
    ) -> None:
        self._exchange = exchange
        self.venue_id = venue_id
        self._execution = execution_engine or PaperExecutionEngine()
        self._enabled = enabled
        self._guard = guard or LiveTradingGuard()

    @property
    def capabilities(self) -> VenueCapabilities:
        return VenueCapabilities(
            supports_spot=True,
            supports_perps=True,
            supports_options=False,
            supports_prediction=False,
            supports_post_only=True,
            supports_reduce_only=True,
            supports_trailing_stop=False,
            supports_native_oco=False,
            supports_batch_orders=True,
            supports_subaccounts=False,
        )

    @property
    def status(self) -> ConnectorStatus:
        return ConnectorStatus.EXPERIMENTAL if self._enabled else ConnectorStatus.DISABLED

    def _require_enabled(self) -> None:
        if not self._enabled:
            raise VenueUnavailable(
                f"CCXT venue {self.venue_id} is disabled by default. Set the venue "
                "enabled flag to activate (paper/testnet only until live keys + guard)."
            )

    def get_ticker_events(
        self, symbol: str, instrument_id: str
    ) -> tuple[BestBidAsk, ReferencePriceUpdate]:
        self._require_enabled()
        try:
            raw = self._exchange.fetch_ticker(symbol)
        except Exception as exc:
            raise VenueUnavailable(f"{self.venue_id} ticker unavailable: {exc}") from exc
        quality = DataQuality.LIVE
        bba = BestBidAsk(
            source=self.venue_id,
            instrument_id=instrument_id,
            quality=quality,
            bid_price=Decimal(str(raw["bid"])) if raw.get("bid") else None,
            ask_price=Decimal(str(raw["ask"])) if raw.get("ask") else None,
        )
        ref = ReferencePriceUpdate(
            source=self.venue_id,
            instrument_id=instrument_id,
            quality=quality,
            reference_price=Decimal(str(raw["last"])),
        )
        return bba, ref

    def get_candles(
        self, symbol: str, instrument_id: str, timeframe: str = "1h", limit: int = 100
    ) -> list[Candle]:
        self._require_enabled()
        try:
            rows = self._exchange.fetch_ohlcv(symbol, timeframe=timeframe, limit=limit)
        except Exception as exc:
            raise VenueUnavailable(f"{self.venue_id} OHLCV unavailable: {exc}") from exc
        return [
            Candle(
                source=self.venue_id,
                instrument_id=instrument_id,
                quality=DataQuality.LIVE,
                interval=timeframe,
                open=Decimal(str(r[1])),
                high=Decimal(str(r[2])),
                low=Decimal(str(r[3])),
                close=Decimal(str(r[4])),
                volume=Decimal(str(r[5])),
                source_timestamp_ms=int(r[0]),
            )
            for r in rows
        ]

    def place_order(self, order: Order, mid_price: Decimal) -> Order:
        self._require_enabled()
        return self._execution.submit(order, mid_price)

    def get_balance(self, asset: Asset) -> Money:
        raise VenueUnavailable(f"{self.venue_id} balance requires live API keys (not configured).")

    def get_positions(self) -> list[object]:
        raise VenueUnavailable(f"{self.venue_id} positions require live API keys (not configured).")

    def cancel_order(self, venue_order_id: str) -> bool:
        raise VenueUnavailable(f"{self.venue_id} cancel requires live API keys (not configured).")
