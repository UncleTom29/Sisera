"""Canonical portfolio domain (spec §15).

Decimal-based portfolio state with hierarchical structure (Organization → Desk →
Portfolio → sub-portfolios) and the exposure/metrics from spec §15: cash, NAV, equity,
realized/unrealized PnL, gross/net exposure, leverage, margin, and concentration.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from sisera_domain.money import Asset, Money
from sisera_domain.order import OrderSide


class Position(BaseModel):
    """A canonical open position on a single instrument."""

    model_config = ConfigDict(frozen=True)

    instrument_id: str
    side: OrderSide
    quantity: Decimal
    entry_price: Decimal
    mark_price: Decimal
    margin: Money | None = None
    leverage: Decimal = Decimal("1")
    quote_asset: Asset | None = None

    @property
    def notional(self) -> Decimal:
        return self.quantity * self.mark_price

    @property
    def unrealized_pnl(self) -> Decimal:
        """Signed unrealized PnL in quote-asset terms."""
        if self.side == OrderSide.BUY:
            return (self.mark_price - self.entry_price) * self.quantity
        return (self.entry_price - self.mark_price) * self.quantity

    @property
    def signed_notional(self) -> Decimal:
        """Positive for long, negative for short (net-exposure contribution)."""
        return self.notional if self.side == OrderSide.BUY else -self.notional


class Portfolio(BaseModel):
    """A portfolio node. Hierarchical via `parent_id` (spec §15)."""

    model_config = ConfigDict(frozen=True)

    portfolio_id: str
    name: str
    parent_id: str | None = None
    cash: dict[str, Money] = Field(default_factory=dict)
    positions: dict[str, Position] = Field(default_factory=dict)
    realized_pnl: dict[str, Money] = Field(default_factory=dict)
    peak_equity: Decimal = Decimal("0")
    quote_asset: Asset | None = None

    def cash_in(self, asset: Asset | str) -> Money:
        a = Asset(asset) if isinstance(asset, str) else asset
        return self.cash.get(a.code, Money(Decimal("0"), a))

    @property
    def equity(self) -> Decimal:
        """Equity in quote-asset terms = cash + unrealized PnL across positions."""
        if self.quote_asset is None:
            return Decimal("0")
        total = self.cash_in(self.quote_asset).amount
        for pos in self.positions.values():
            total += pos.unrealized_pnl
        return total

    @property
    def gross_exposure(self) -> Decimal:
        return sum((p.notional for p in self.positions.values()), Decimal("0"))

    @property
    def net_exposure(self) -> Decimal:
        return sum((p.signed_notional for p in self.positions.values()), Decimal("0"))

    @property
    def leverage(self) -> Decimal:
        eq = self.equity
        if eq <= 0:
            return Decimal("0")
        return self.gross_exposure / eq

    @property
    def margin_used(self) -> Decimal:
        return sum(
            (p.margin.amount for p in self.positions.values() if p.margin is not None),
            Decimal("0"),
        )

    @property
    def concentration(self) -> Decimal:
        """Largest single-position notional as a fraction of equity."""
        eq = self.equity
        if eq <= 0 or not self.positions:
            return Decimal("0")
        largest = max(p.notional for p in self.positions.values())
        return largest / eq

    @property
    def current_drawdown(self) -> Decimal:
        peak = self.peak_equity
        eq = self.equity
        if peak <= 0:
            return Decimal("0")
        return max(Decimal("0"), (peak - eq) / peak)
