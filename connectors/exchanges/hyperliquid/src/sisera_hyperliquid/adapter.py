"""Hyperliquid venue adapter: `/info` market data normalized to canonical events."""

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
    DataQuality,
    FundingUpdate,
    OpenInterestUpdate,
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


class HyperliquidVenueAdapter:
    venue_id = "hyperliquid"

    def __init__(
        self,
        client: Any,
        execution_engine: PaperExecutionEngine | None = None,
        enabled: bool = False,
        guard: LiveTradingGuard | None = None,
    ) -> None:
        self._client = client
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
            supports_subaccounts=True,
        )

    @property
    def status(self) -> ConnectorStatus:
        if not self._enabled:
            return ConnectorStatus.DISABLED
        return ConnectorStatus.EXPERIMENTAL

    def _require_enabled(self) -> None:
        if not self._enabled:
            raise VenueUnavailable(
                "Hyperliquid connector is disabled by default. Set "
                "SISERA_HYPERLIQUID_ENABLED=true to enable (paper/testnet only until "
                "live signing is wired with credentials + LiveTradingGuard)."
            )

    def get_perp_contexts(self) -> list[dict[str, Any]]:
        """Join universe metadata with asset contexts into per-coin dicts."""
        self._require_enabled()
        universe, ctxs = self._client.get_meta_and_asset_ctxs()
        out: list[dict[str, Any]] = []
        for meta, ctx in zip(universe, ctxs, strict=False):
            out.append(
                {
                    "coin": meta.get("name"),
                    "szDecimals": meta.get("szDecimals"),
                    "markPx": ctx.get("markPx"),
                    "funding": ctx.get("funding"),
                    "openInterest": ctx.get("openInterest"),
                }
            )
        return out

    def get_ticker_events(
        self, coin: str, instrument_id: str
    ) -> tuple[BestBidAsk, ReferencePriceUpdate, FundingUpdate, OpenInterestUpdate]:
        self._require_enabled()
        book = self._client.get_l2_book(coin)
        levels = book.get("levels", [[], []])
        bids = levels[0] if len(levels) > 0 else []
        asks = levels[1] if len(levels) > 1 else []
        bid = Decimal(bids[0]["px"]) if bids else None
        ask = Decimal(asks[0]["px"]) if asks else None

        universe, ctxs = self._client.get_meta_and_asset_ctxs()
        mark = funding = oi = None
        for meta, ctx in zip(universe, ctxs, strict=False):
            if meta.get("name") == coin:
                mark = Decimal(ctx["markPx"]) if ctx.get("markPx") else None
                funding = Decimal(ctx["funding"]) if ctx.get("funding") else Decimal("0")
                oi = Decimal(ctx["openInterest"]) if ctx.get("openInterest") else Decimal("0")
                break

        quality = DataQuality.LIVE
        bba = BestBidAsk(
            source=self.venue_id, instrument_id=instrument_id, quality=quality,
            bid_price=bid, ask_price=ask,
        )
        ref = ReferencePriceUpdate(
            source=self.venue_id, instrument_id=instrument_id, quality=quality,
            reference_price=mark if mark is not None else Decimal("0"),
        )
        fund = FundingUpdate(
            source=self.venue_id, instrument_id=instrument_id, quality=quality,
            funding_rate=funding or Decimal("0"),
        )
        open_interest = OpenInterestUpdate(
            source=self.venue_id, instrument_id=instrument_id, quality=quality,
            open_interest=oi or Decimal("0"),
        )
        return bba, ref, fund, open_interest

    def place_order(self, order: Order, mid_price: Decimal) -> Order:
        self._require_enabled()
        return self._execution.submit(order, mid_price)

    def get_balance(self, asset: Asset) -> Money:
        raise VenueUnavailable("Hyperliquid balance requires an agent wallet (not configured).")

    def get_positions(self) -> list[object]:
        raise VenueUnavailable("Hyperliquid positions require an agent wallet (not configured).")

    def cancel_order(self, venue_order_id: str) -> bool:
        raise VenueUnavailable("Hyperliquid cancel requires /exchange signing (not wired).")
