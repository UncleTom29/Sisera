"""Portfolio stress testing (spec §16).

User-defined scenarios apply factor shocks (e.g. "BTC -10%", "DXY +2%", "USDC depeg",
"volatility x2", "funding spike", "liquidity -70%") and propagate them to held positions
via per-factor sensitivities (betas). The result reports impact by portfolio, position,
and factor, plus projected equity and margin ratio with breach flags.
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from sisera_domain.order import OrderSide
from sisera_domain.portfolio import Portfolio, Position


class Scenario(BaseModel):
    """A user-defined stress scenario: named factor shocks expressed as decimal returns."""

    model_config = ConfigDict(frozen=True)

    name: str
    shocks: dict[str, Decimal] = Field(default_factory=dict)  # factor -> return (e.g. BTC -> -0.10)


class StressImpact(BaseModel):
    model_config = ConfigDict(frozen=True)

    scenario: str
    total_pnl: Decimal
    projected_equity: Decimal
    projected_margin_ratio: Decimal
    by_instrument: dict[str, Decimal] = Field(default_factory=dict)
    by_factor: dict[str, Decimal] = Field(default_factory=dict)
    breaches: tuple[str, ...] = Field(default_factory=tuple)


class StressEngine:
    """Applies scenarios to a portfolio using per-position factor sensitivities."""

    def __init__(
        self,
        *,
        margin_ratio_breach: Decimal = Decimal("0.85"),
        equity_loss_breach: Decimal = Decimal("0.30"),
    ) -> None:
        self.margin_ratio_breach = margin_ratio_breach
        self.equity_loss_breach = equity_loss_breach

    @staticmethod
    def position_return(position: Position, scenario: Scenario) -> Decimal:
        """Signed return of a position under a scenario, via its beta map."""
        total = Decimal("0")
        for factor, shock in scenario.shocks.items():
            total += position.beta_map.get(factor, Decimal("0")) * shock
        return total

    def stress(self, portfolio: Portfolio, scenario: Scenario) -> StressImpact:
        by_instrument: dict[str, Decimal] = {}
        by_factor: dict[str, Decimal] = {}
        total_pnl = Decimal("0")

        for iid, pos in portfolio.positions.items():
            ret = self.position_return(pos, scenario)
            pnl = pos.notional * ret
            if pos.side == OrderSide.SELL:
                pnl = -pnl
            by_instrument[iid] = pnl
            total_pnl += pnl
            for factor, shock in scenario.shocks.items():
                fpnl = pos.notional * pos.beta_map.get(factor, Decimal("0")) * shock
                if pos.side == OrderSide.SELL:
                    fpnl = -fpnl
                by_factor[factor] = by_factor.get(factor, Decimal("0")) + fpnl

        projected_equity = portfolio.equity + total_pnl
        margin = portfolio.margin_used
        projected_margin_ratio = margin / projected_equity if projected_equity > 0 else Decimal("0")

        breaches: list[str] = []
        if projected_margin_ratio > self.margin_ratio_breach:
            breaches.append(
                f"margin_ratio:{projected_margin_ratio:.2%}>{self.margin_ratio_breach:.0%}"
            )
        if portfolio.equity > 0:
            loss = -total_pnl / portfolio.equity
            if loss > self.equity_loss_breach:
                breaches.append(f"equity_loss:{loss:.2%}>{self.equity_loss_breach:.0%}")

        return StressImpact(
            scenario=scenario.name,
            total_pnl=total_pnl,
            projected_equity=projected_equity,
            projected_margin_ratio=projected_margin_ratio,
            by_instrument=by_instrument,
            by_factor=by_factor,
            breaches=tuple(breaches),
        )
