"""Transaction Cost Analysis (spec §19).

Measures execution quality per fill and in aggregate: slippage, implementation shortfall
(decomposed into timing vs execution cost), fill ratio, maker/taker mix, latency, and
markout (adverse selection proxy). All amounts are Decimal (ADR-002).
"""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field

from sisera_domain.money import Asset, Money
from sisera_domain.order import OrderSide


class FillRecord(BaseModel):
    """A single executed fill plus the reference prices needed for TCA."""

    model_config = ConfigDict(frozen=True)

    order_id: str
    side: OrderSide
    instrument_id: str
    quantity: Decimal
    ordered_quantity: Decimal
    execution_price: Decimal
    decision_price: Decimal
    arrival_price: Decimal
    mid_price: Decimal
    vwap: Decimal | None = None
    fees: Money = Field(default_factory=lambda: Money(Decimal("0"), Asset("USDT")))
    gas_cost: Money | None = None
    bridge_cost: Money | None = None
    latency_ms: int = 0
    is_maker: bool = False
    markout_1m: Decimal | None = None
    markout_5m: Decimal | None = None
    markout_30m: Decimal | None = None

    @property
    def notional(self) -> Decimal:
        return self.quantity * self.execution_price

    def _signed_return(self, ref: Decimal) -> Decimal:
        """Signed % move of execution vs reference, positive when favorable."""
        if self.side == OrderSide.BUY:
            return (self.execution_price - ref) / ref
        return (ref - self.execution_price) / ref


class FillTCA(BaseModel):
    model_config = ConfigDict(frozen=True)

    order_id: str
    slippage_bps: Decimal
    implementation_shortfall_bps: Decimal
    timing_cost_bps: Decimal
    execution_cost_bps: Decimal
    fee_bps: Decimal
    fill_ratio: Decimal
    latency_ms: int
    markout_1m_bps: Decimal | None = None
    markout_5m_bps: Decimal | None = None
    markout_30m_bps: Decimal | None = None


def _bps(fraction: Decimal) -> Decimal:
    return (fraction * Decimal("10000")).quantize(Decimal("0.01"))


class TCAEngine:
    """Computes per-fill and aggregate execution-quality metrics."""

    def analyze(self, fill: FillRecord) -> FillTCA:
        # Slippage vs mid (in bps of mid, signed toward cost).
        if fill.mid_price > 0:
            slip_frac = fill._signed_return(fill.mid_price)
        else:
            slip_frac = Decimal("0")

        # Implementation shortfall vs decision price, and its decomposition.
        if fill.decision_price > 0:
            is_frac = fill._signed_return(fill.decision_price)
        else:
            is_frac = Decimal("0")

        if fill.arrival_price > 0:
            timing_frac = fill._signed_return(fill.arrival_price) - is_frac
            exec_frac = (
                (fill.execution_price - fill.arrival_price) / fill.arrival_price
                if fill.side == OrderSide.BUY
                else (fill.arrival_price - fill.execution_price) / fill.arrival_price
            )
        else:
            timing_frac = Decimal("0")
            exec_frac = Decimal("0")

        fee_bps = Decimal("0")
        if fill.notional > 0:
            total_fees = fill.fees.amount + (
                fill.gas_cost.amount if fill.gas_cost else Decimal("0")
            ) + (fill.bridge_cost.amount if fill.bridge_cost else Decimal("0"))
            fee_bps = total_fees / fill.notional

        fill_ratio = (
            fill.quantity / fill.ordered_quantity
            if fill.ordered_quantity > 0
            else Decimal("0")
        )

        return FillTCA(
            order_id=fill.order_id,
            slippage_bps=_bps(slip_frac),
            implementation_shortfall_bps=_bps(is_frac),
            timing_cost_bps=_bps(timing_frac),
            execution_cost_bps=_bps(exec_frac),
            fee_bps=_bps(fee_bps),
            fill_ratio=fill_ratio,
            latency_ms=fill.latency_ms,
            markout_1m_bps=_bps(fill.markout_1m) if fill.markout_1m is not None else None,
            markout_5m_bps=_bps(fill.markout_5m) if fill.markout_5m is not None else None,
            markout_30m_bps=_bps(fill.markout_30m) if fill.markout_30m is not None else None,
        )

    def aggregate(self, fills: list[FillRecord]) -> dict[str, Decimal]:
        """Portfolio-level aggregates (simple means and maker/taker mix)."""
        if not fills:
            return {}
        tcas = [self.analyze(f) for f in fills]
        n = len(tcas)
        maker_count = sum(1 for f in fills if f.is_maker)

        def _mean(field: str) -> Decimal:
            vals = [getattr(t, field) for t in tcas if getattr(t, field) is not None]
            return sum(vals, Decimal("0")) / len(vals) if vals else Decimal("0")

        return {
            "avg_slippage_bps": _mean("slippage_bps"),
            "avg_implementation_shortfall_bps": _mean("implementation_shortfall_bps"),
            "avg_timing_cost_bps": _mean("timing_cost_bps"),
            "avg_execution_cost_bps": _mean("execution_cost_bps"),
            "avg_fee_bps": _mean("fee_bps"),
            "avg_fill_ratio": _mean("fill_ratio"),
            "maker_ratio": Decimal(maker_count) / n if n else Decimal("0"),
            "fill_count": Decimal(n),
        }
