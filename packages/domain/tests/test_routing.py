"""Tests for the Smart Order Router (spec §14)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import (
    Order,
    OrderSide,
    OrderType,
    RouteConstraints,
    SmartOrderRouter,
    VenueHealth,
    VenueQuote,
)


def _order(qty: str = "1") -> Order:
    return Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="btc",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal(qty),
        account_id="a",
        portfolio_id="pf_1",
    )


def _quote(
    venue_id: str,
    mid: str = "60000",
    spread_bps: str = "2",
    fee_rate: str = "0.0005",
    liquidity: str = "1000000",
    latency_ms: int = 10,
    depth: str = "100",
    **overrides: object,
) -> VenueQuote:
    mid_d = Decimal(mid)
    half = mid_d * Decimal(spread_bps) / Decimal("10000")
    return VenueQuote(
        venue_id=venue_id,
        instrument_id="btc",
        bid=mid_d - half,
        ask=mid_d + half,
        available_liquidity_notional=Decimal(liquidity),
        depth_at_touch=Decimal(depth),
        fee_rate=Decimal(fee_rate),
        latency_ms=latency_ms,
        **overrides,  # type: ignore[arg-type]
    )


def test_router_does_not_pick_cheapest_displayed_price() -> None:
    """A venue with a better displayed price but high fees/failure must lose."""
    router = SmartOrderRouter()
    cheap_price = _quote("cheap", mid="59900", fee_rate="0.02")  # 2% fee
    fair_price = _quote("fair", mid="60000", fee_rate="0.0005")
    plan = router.route(_order(), [cheap_price, fair_price], reference_price=Decimal("60000"))
    assert plan.decision == "ROUTE"
    assert plan.legs[0].venue_id == "fair"
    assert plan.legs[0].breakdown.fee > Decimal("0")


def test_router_excludes_down_and_excluded_venues() -> None:
    router = SmartOrderRouter()
    down = _quote("down", health=VenueHealth.DOWN)
    excluded = _quote("excluded")
    ok = _quote("ok")
    constraints = RouteConstraints(excluded_venues=frozenset({"excluded"}))
    plan = router.route(_order(), [down, excluded, ok], Decimal("60000"), constraints)
    assert plan.legs[0].venue_id == "ok"
    assert any("down" in r for r in plan.reasons)
    assert any("excluded" in r for r in plan.reasons)


def test_router_splits_when_cheapest_lacks_depth() -> None:
    router = SmartOrderRouter()
    shallow = _quote("shallow", depth="0.4")
    deep = _quote("deep")
    plan = router.route(_order("1"), [shallow, deep], Decimal("60000"))
    assert plan.decision == "ROUTE"
    quantities = {leg.venue_id: leg.quantity for leg in plan.legs}
    assert quantities["shallow"] == Decimal("0.4")
    assert quantities["deep"] == Decimal("0.6")


def test_router_no_route_when_no_eligible_venue() -> None:
    router = SmartOrderRouter()
    plan = router.route(_order(), [], Decimal("60000"))
    assert plan.decision == "NO_ROUTE"


def test_router_respects_max_latency() -> None:
    router = SmartOrderRouter()
    slow = _quote("slow", latency_ms=100_000)
    fast = _quote("fast", latency_ms=5)
    constraints = RouteConstraints(max_latency_ms=1000)
    plan = router.route(_order(), [slow, fast], Decimal("60000"), constraints)
    assert plan.legs[0].venue_id == "fast"
    assert any("slow" in r for r in plan.reasons)


def test_cost_breakdown_sums_to_total() -> None:
    router = SmartOrderRouter()
    q = _quote("v")
    cost = router.estimate_cost(_order(), q, Decimal("60000"))
    assert cost.total > Decimal("0")
    assert cost.fee == Decimal("1") * q.ask * Decimal("0.0005")
    # Slippage = half-spread cost on a buy.
    assert cost.slippage > Decimal("0")
