"""Venue adapter interface and deterministic paper execution engine.

`VenueAdapter` is the generic venue protocol (spec §10) with capability flags. The
`PaperExecutionEngine` is the deterministic paper-trading simulator (spec §52): it models
spread, order type, maker/taker fees, and partial fills from a depth assumption. It is
deterministic (no random fill) so tests and paper deployments are reproducible.
"""

from __future__ import annotations

from decimal import Decimal
from typing import Protocol

from pydantic import BaseModel, ConfigDict

from sisera_domain.money import Asset, Money
from sisera_domain.order import Order, OrderSide, OrderType


class VenueCapabilities(BaseModel):
    """Capability flags — not every venue supports every function (spec §10)."""

    model_config = ConfigDict(frozen=True)

    supports_spot: bool = False
    supports_perps: bool = False
    supports_options: bool = False
    supports_prediction: bool = False
    supports_post_only: bool = False
    supports_reduce_only: bool = False
    supports_trailing_stop: bool = False
    supports_native_oco: bool = False
    supports_batch_orders: bool = False
    supports_subaccounts: bool = False


class VenueAdapter(Protocol):
    """Generic venue interface (spec §10). Implementations are in `connectors/`."""

    capabilities: VenueCapabilities

    def place_order(self, order: Order) -> Order: ...
    def cancel_order(self, venue_order_id: str) -> bool: ...
    def amend_order(self, venue_order_id: str, **updates: object) -> bool: ...
    def get_balance(self, asset: Asset) -> Money: ...
    def get_positions(self) -> list[object]: ...
    def get_orders(self) -> list[object]: ...
    def get_order(self, venue_order_id: str) -> object: ...
    def get_fills(self) -> list[object]: ...
    def set_leverage(self, leverage: Decimal) -> bool: ...
    def set_margin_mode(self, mode: str) -> bool: ...
    def get_funding(self, symbol: str) -> Decimal: ...
    def get_open_interest(self, symbol: str) -> Decimal: ...


class PaperFill(BaseModel):
    model_config = ConfigDict(frozen=True)

    fill_id: str
    quantity: Decimal
    price: Decimal
    fee: Money


class PaperExecutionEngine:
    """Deterministic paper-trading simulator (spec §52).

    Models spread (given in bps around mid), maker/taker fee split by whether the order
    crosses the spread, and partial fills against an assumed depth. Limit/post-only orders
    that do not cross rest (remain open) rather than instantly filling.
    """

    def __init__(
        self,
        taker_fee_rate: Decimal = Decimal("0.0006"),
        maker_fee_rate: Decimal = Decimal("0.0002"),
        spread_bps: Decimal = Decimal("2"),
        fee_asset: Asset | str = "USDT",
    ) -> None:
        self.taker_fee_rate = taker_fee_rate
        self.maker_fee_rate = maker_fee_rate
        self.spread_bps = spread_bps
        self.fee_asset = Asset(fee_asset) if isinstance(fee_asset, str) else fee_asset
        self.fills: list[PaperFill] = []
        self.open_orders: dict[str, Order] = {}
        self._next_id = 1

    def _venue_order_id(self) -> str:
        vid = f"paper_{self._next_id}"
        self._next_id += 1
        return vid

    def _half_spread(self, mid: Decimal) -> Decimal:
        return mid * self.spread_bps / Decimal("10000")

    def submit(self, order: Order, mid_price: Decimal, depth: Decimal | None = None) -> Order:
        """Simulate submission of `order` against `mid_price`.

        Returns a new immutable Order reflecting the resulting state. Limit/post-only
        orders that do not cross remain open (ACKNOWLEDGED); crossing or market orders fill
        immediately (fully or partially against `depth`).
        """
        half = self._half_spread(mid_price)
        bid = mid_price - half
        ask = mid_price + half
        buy = order.side == OrderSide.BUY

        crosses = False
        if order.order_type in (OrderType.MARKET, OrderType.IOC, OrderType.FOK):
            crosses = True
            fill_price = ask if buy else bid
        elif order.price is not None:
            # A resting buy crosses when its limit is >= ask; a resting sell when <= bid.
            crosses = (buy and order.price >= ask) or ((not buy) and order.price <= bid)
            fill_price = ask if buy else bid
        else:
            fill_price = mid_price

        if not crosses:
            # Resting order: acknowledge, do not fill.
            updated = order.model_copy(
                update={"venue_order_id": self._venue_order_id()},
            )
            self.open_orders[updated.venue_order_id] = updated
            return updated

        available = depth if depth is not None else order.quantity
        fill_qty = min(order.quantity, available)
        fee_rate = self.taker_fee_rate if crosses else self.maker_fee_rate
        notional = fill_qty * fill_price
        fee = Money(notional * fee_rate, self.fee_asset)

        self.fills.append(
            PaperFill(fill_id=f"fill_{self._next_id}", quantity=fill_qty, price=fill_price, fee=fee)
        )

        updated = order.model_copy(
            update={
                "venue_order_id": self._venue_order_id(),
                "filled_quantity": fill_qty,
                "avg_fill_price": fill_price,
                "fee_paid": fee,
            }
        )
        if fill_qty < order.quantity:
            self.open_orders[updated.venue_order_id] = updated
        return updated
