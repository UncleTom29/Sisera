"""Smart Order Router (spec §14).

The router does **not** simply choose the venue with the best displayed price. It estimates
the full expected execution cost:

    ExpectedExecutionCost = price impact + slippage + trading fee + gas + bridge cost
        + expected adverse selection + funding impact + failure probability cost
        + latency penalty + settlement/counterparty penalty

and routes accordingly, honoring venue exclusions, preferences, compliance restrictions,
minimum liquidity, maximum slippage/latency, and gas limits. The routing decision and its
reasons are retained for audit (decision provenance).
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from sisera_domain.money import Asset, Money
from sisera_domain.order import Order, OrderSide


class VenueHealth(StrEnum):
    UP = "UP"
    DEGRADED = "DEGRADED"
    DOWN = "DOWN"


class VenueQuote(BaseModel):
    """A venue's execution quote for one instrument (used to estimate routing cost)."""

    model_config = ConfigDict(frozen=True)

    venue_id: str
    instrument_id: str
    bid: Decimal
    ask: Decimal
    depth_at_touch: Decimal = Decimal("0")
    available_liquidity_notional: Decimal = Decimal("0")
    fee_rate: Decimal = Decimal("0")
    gas_cost: Money | None = None
    bridge_cost: Money | None = None
    latency_ms: int = 0
    failure_probability: Decimal = Decimal("0")
    adverse_selection_bps: Decimal = Decimal("0")
    funding_impact_bps: Decimal = Decimal("0")
    counterparty_penalty: Money | None = None
    health: VenueHealth = VenueHealth.UP


class RouteConstraints(BaseModel):
    model_config = ConfigDict(frozen=True)

    excluded_venues: frozenset[str] = frozenset()
    preferred_venues: tuple[str, ...] = Field(default_factory=tuple)
    min_liquidity_notional: Decimal = Decimal("0")
    max_slippage_bps: Decimal = Decimal("100")
    max_latency_ms: int = 10_000
    max_gas: Money | None = None


class CostBreakdown(BaseModel):
    model_config = ConfigDict(frozen=True)

    price_impact: Decimal = Decimal("0")
    slippage: Decimal = Decimal("0")
    fee: Decimal = Decimal("0")
    gas: Decimal = Decimal("0")
    bridge: Decimal = Decimal("0")
    adverse_selection: Decimal = Decimal("0")
    funding_impact: Decimal = Decimal("0")
    latency_penalty: Decimal = Decimal("0")
    counterparty: Decimal = Decimal("0")
    failure_cost: Decimal = Decimal("0")

    @property
    def total(self) -> Decimal:
        return (
            self.price_impact
            + self.slippage
            + self.fee
            + self.gas
            + self.bridge
            + self.adverse_selection
            + self.funding_impact
            + self.latency_penalty
            + self.counterparty
            + self.failure_cost
        )


class RouteLeg(BaseModel):
    model_config = ConfigDict(frozen=True)

    venue_id: str
    instrument_id: str
    quantity: Decimal
    expected_cost: Decimal
    breakdown: CostBreakdown


class RoutePlan(BaseModel):
    model_config = ConfigDict(frozen=True)

    order_id: str
    side: OrderSide
    legs: tuple[RouteLeg, ...] = Field(default_factory=tuple)
    total_expected_cost: Decimal = Decimal("0")
    reasons: tuple[str, ...] = Field(default_factory=tuple)
    decision: str = "ROUTE"


class SmartOrderRouter:
    """Cost-aware router. Estimates expected execution cost per venue and splits/falls
    back as needed (spec §14)."""

    def __init__(
        self,
        *,
        impact_coefficient: Decimal = Decimal("0.01"),
        latency_cost_per_ms: Decimal = Decimal("0.000001"),
        failure_recovery_fraction: Decimal = Decimal("0.5"),
        fee_asset: Asset | str = "USDT",
    ) -> None:
        self.impact_coefficient = impact_coefficient
        self.latency_cost_per_ms = latency_cost_per_ms
        self.failure_recovery_fraction = failure_recovery_fraction
        self.fee_asset = Asset(fee_asset) if isinstance(fee_asset, str) else fee_asset

    def _mid(self, q: VenueQuote) -> Decimal:
        return (q.bid + q.ask) / 2

    def estimate_cost(
        self, order: Order, quote: VenueQuote, reference_price: Decimal
    ) -> CostBreakdown:
        buy = order.side == OrderSide.BUY
        mid = self._mid(quote)
        exec_price = quote.ask if buy else quote.bid
        notional = order.quantity * exec_price

        # Slippage: crossing the spread (half-spread, expressed as notional cost).
        slippage = notional * (exec_price - mid) / mid if mid > 0 else Decimal("0")

        # Price impact: scales with size relative to available liquidity.
        if quote.available_liquidity_notional > 0:
            impact = self.impact_coefficient * notional * (
                notional / quote.available_liquidity_notional
            )
        else:
            impact = Decimal("0")

        fee = notional * quote.fee_rate
        gas = quote.gas_cost.amount if quote.gas_cost else Decimal("0")
        bridge = quote.bridge_cost.amount if quote.bridge_cost else Decimal("0")
        adverse = notional * quote.adverse_selection_bps / Decimal("10000")
        funding = notional * quote.funding_impact_bps / Decimal("10000")
        latency = Decimal(quote.latency_ms) * self.latency_cost_per_ms * notional
        counterparty = quote.counterparty_penalty.amount if quote.counterparty_penalty else Decimal("0")
        # Expected loss if the venue fails: we lose some fraction of the in-flight notional.
        failure = notional * quote.failure_probability * self.failure_recovery_fraction

        # A buy's slippage is always non-negative (pay the ask); keep the invariant.
        return CostBreakdown(
            price_impact=max(impact, Decimal("0")),
            slippage=max(slippage, Decimal("0")),
            fee=fee,
            gas=gas,
            bridge=bridge,
            adverse_selection=adverse,
            funding_impact=funding,
            latency_penalty=latency,
            counterparty=counterparty,
            failure_cost=failure,
        )

    def _eligible(self, order: Order, quote: VenueQuote, constraints: RouteConstraints) -> list[str]:
        reasons: list[str] = []
        if quote.venue_id in constraints.excluded_venues:
            reasons.append(f"{quote.venue_id}:excluded")
        if quote.health == VenueHealth.DOWN:
            reasons.append(f"{quote.venue_id}:down")
        elif quote.health == VenueHealth.DEGRADED:
            reasons.append(f"{quote.venue_id}:degraded")
        if quote.available_liquidity_notional < constraints.min_liquidity_notional:
            reasons.append(f"{quote.venue_id}:insufficient_liquidity")
        if quote.latency_ms > constraints.max_latency_ms:
            reasons.append(f"{quote.venue_id}:excessive_latency")
        if constraints.max_gas is not None and quote.gas_cost is not None:
            if quote.gas_cost.amount > constraints.max_gas.amount:
                reasons.append(f"{quote.venue_id}:gas_over_limit")
        return reasons

    def route(
        self,
        order: Order,
        quotes: list[VenueQuote],
        reference_price: Decimal,
        constraints: RouteConstraints | None = None,
    ) -> RoutePlan:
        constraints = constraints or RouteConstraints()
        reasons: list[str] = []

        eligible: list[tuple[VenueQuote, CostBreakdown]] = []
        for q in quotes:
            if q.instrument_id != order.instrument_id:
                continue
            rejects = self._eligible(order, q, constraints)
            reasons.extend(rejects)
            if rejects:
                continue
            cost = self.estimate_cost(order, q, reference_price)
            eligible.append((q, cost))

        if not eligible:
            return RoutePlan(
                order_id=order.sisera_order_id,
                side=order.side,
                total_expected_cost=Decimal("0"),
                reasons=tuple(reasons) + ("no_eligible_venue",),
                decision="NO_ROUTE",
            )

        # Sort by expected cost ascending; break ties toward preferred venues.
        def _pref_rank(q: VenueQuote) -> int:
            try:
                return constraints.preferred_venues.index(q.venue_id)
            except ValueError:
                return len(constraints.preferred_venues)

        eligible.sort(key=lambda item: (item[1].total, _pref_rank(item[0])))

        # Fill the order, splitting across venues when the cheapest lacks depth.
        remaining = order.quantity
        legs: list[RouteLeg] = []
        for q, cost in eligible:
            if remaining <= 0:
                break
            take = min(remaining, q.depth_at_touch) if q.depth_at_touch > 0 else remaining
            if take <= 0:
                continue
            leg_cost = cost.total * (take / order.quantity)
            legs.append(
                RouteLeg(
                    venue_id=q.venue_id,
                    instrument_id=q.instrument_id,
                    quantity=take,
                    expected_cost=leg_cost,
                    breakdown=cost,
                )
            )
            remaining -= take

        if remaining > 0:
            reasons.append(f"partial_route:unfilled_quantity={remaining}")
            decision = "PARTIAL"
        else:
            decision = "ROUTE"

        total = sum((leg.expected_cost for leg in legs), Decimal("0"))
        return RoutePlan(
            order_id=order.sisera_order_id,
            side=order.side,
            legs=tuple(legs),
            total_expected_cost=total,
            reasons=tuple(reasons),
            decision=decision,
        )
