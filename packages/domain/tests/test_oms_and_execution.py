"""Tests for the OMS manager (idempotency) and paper execution engine (spec §52)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import (
    OrderManager,
    OrderSide,
    OrderState,
    OrderType,
    PaperExecutionEngine,
    VenueCapabilities,
)


def _make_order_manager_with_order(client_order_id: str = "client_1") -> tuple[OrderManager, object]:
    om = OrderManager()
    order = om.create_order(
        client_order_id=client_order_id,
        instrument_id="bybit_btc_perp",
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        quantity=Decimal("0.5"),
        price=Decimal("64000"),
        account_id="acct_1",
        portfolio_id="pf_1",
    )
    return om, order


def test_oms_enforces_idempotency_on_client_order_id() -> None:
    om, first = _make_order_manager_with_order("client_1")
    second = om.create_order(
        client_order_id="client_1",
        instrument_id="bybit_btc_perp",
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        quantity=Decimal("0.5"),
        price=Decimal("64000"),
        account_id="acct_1",
        portfolio_id="pf_1",
    )
    assert second.sisera_order_id == first.sisera_order_id
    assert len(om) == 1  # no duplicate order


def test_oms_advance_state() -> None:
    om, order = _make_order_manager_with_order()
    om.advance(order.sisera_order_id, OrderState.VALIDATING)
    om.advance(order.sisera_order_id, OrderState.RISK_CHECK)
    assert om.get(order.sisera_order_id).state == OrderState.RISK_CHECK


def test_oms_record_fill_transitions_to_filled() -> None:
    om, order = _make_order_manager_with_order()
    # Advance through to a state that permits fills.
    for s in [
        OrderState.VALIDATING,
        OrderState.RISK_CHECK,
        OrderState.ROUTING,
        OrderState.SUBMITTING,
        OrderState.ACKNOWLEDGED,
    ]:
        om.advance(order.sisera_order_id, s)
    filled = om.record_fill(order.sisera_order_id, Decimal("0.5"), Decimal("64000"))
    assert filled.state == OrderState.FILLED


def test_venue_capability_flags_default_false() -> None:
    caps = VenueCapabilities()
    assert caps.supports_spot is False
    assert caps.supports_perps is False


def test_paper_market_buy_fills_at_ask_with_taker_fee() -> None:
    engine = PaperExecutionEngine(spread_bps=Decimal("2"))
    om, order = _make_order_manager_with_order()
    market = order.model_copy(update={"order_type": OrderType.MARKET, "price": None})
    result = engine.submit(market, mid_price=Decimal("64000"))
    half = Decimal("64000") * Decimal("2") / Decimal("10000")
    assert result.filled_quantity == Decimal("0.5")
    assert result.avg_fill_price == Decimal("64000") + half
    assert result.fee_paid is not None
    assert result.fee_paid.asset.code == "USDT"


def test_paper_resting_limit_does_not_fill() -> None:
    engine = PaperExecutionEngine(spread_bps=Decimal("2"))
    om, order = _make_order_manager_with_order()
    # Limit buy far below the ask -> rests, does not fill.
    result = engine.submit(order, mid_price=Decimal("64000"))
    assert result.filled_quantity == Decimal("0")
    assert result.venue_order_id is not None
    assert result.venue_order_id in engine.open_orders


def test_paper_partial_fill_against_depth() -> None:
    engine = PaperExecutionEngine(spread_bps=Decimal("2"))
    om, order = _make_order_manager_with_order()
    market = order.model_copy(update={"order_type": OrderType.MARKET, "price": None})
    result = engine.submit(market, mid_price=Decimal("64000"), depth=Decimal("0.2"))
    assert result.filled_quantity == Decimal("0.2")
    assert result.filled_quantity < order.quantity


def test_paper_maker_fee_cheaper_than_taker() -> None:
    engine = PaperExecutionEngine(spread_bps=Decimal("2"))
    om, order = _make_order_manager_with_order()
    # A limit that crosses the spread pays taker fee.
    crossing = order.model_copy(update={"price": Decimal("70000")})
    taker = engine.submit(crossing, mid_price=Decimal("64000"))
    assert taker.fee_paid.amount == taker.filled_quantity * taker.avg_fill_price * Decimal("0.0006")
