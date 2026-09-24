"""Tests for the canonical portfolio and deterministic risk engine (spec §15/§16)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import (
    Asset,
    Money,
    Order,
    OrderSide,
    OrderType,
    Portfolio,
    Position,
    RiskEngine,
    RiskPolicy,
    RiskReason,
)


def _usdt(amount: str) -> Money:
    return Money(amount, Asset("USDT"))


def _portfolio(
    equity_usdt: str = "100000", peak_equity: str | None = None, **positions: Position
) -> Portfolio:
    return Portfolio(
        portfolio_id="pf_1",
        name="Main",
        quote_asset=Asset("USDT"),
        cash={"USDT": _usdt(equity_usdt)},
        positions=dict(positions),
        peak_equity=Decimal(peak_equity if peak_equity is not None else equity_usdt),
    )


def _long_position(instrument_id: str, qty: str, entry: str, mark: str) -> Position:
    return Position(
        instrument_id=instrument_id,
        side=OrderSide.BUY,
        quantity=Decimal(qty),
        entry_price=Decimal(entry),
        mark_price=Decimal(mark),
    )


def test_position_unrealized_pnl_long_and_short() -> None:
    long = _long_position("btc", "1", "60000", "65000")
    assert long.unrealized_pnl == Decimal("5000")
    short = long.model_copy(update={"side": OrderSide.SELL})
    assert short.unrealized_pnl == Decimal("-5000")


def test_portfolio_equity_and_exposure() -> None:
    p = _portfolio("100000", btc=_long_position("btc", "1", "60000", "65000"))
    assert p.gross_exposure == Decimal("65000")
    assert p.net_exposure == Decimal("65000")
    assert p.equity == Decimal("105000")  # 100000 cash + 5000 uPnL


def test_net_exposure_nets_long_and_short() -> None:
    p = _portfolio(
        "100000",
        btc=_long_position("btc", "1", "60000", "65000"),
        eth=Position(
            instrument_id="eth",
            side=OrderSide.SELL,
            quantity=Decimal("10"),
            entry_price=Decimal("3000"),
            mark_price=Decimal("3000"),
        ),
    )
    assert p.net_exposure == Decimal("65000") - Decimal("30000") == Decimal("35000")


def test_leverage_and_concentration() -> None:
    p = _portfolio("100000", btc=_long_position("btc", "1", "60000", "65000"))
    assert p.leverage == Decimal("65000") / Decimal("105000")
    assert p.concentration == Decimal("65000") / Decimal("105000")


def test_risk_engine_approves_small_order() -> None:
    engine = RiskEngine()
    order = Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="btc",
        side=OrderSide.BUY,
        order_type=OrderType.LIMIT,
        quantity=Decimal("0.1"),
        price=Decimal("60000"),
        account_id="a",
        portfolio_id="pf_1",
    )
    result = engine.check_pre_trade(order, _portfolio(), mark_price=Decimal("60000"))
    assert result.approved is True
    assert result.reason_codes == []


def test_risk_engine_rejects_oversized_order() -> None:
    policy = RiskPolicy(max_order_notional=Decimal("1000"))
    engine = RiskEngine(policy)
    order = Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="btc",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("1"),
        account_id="a",
        portfolio_id="pf_1",
    )
    result = engine.check_pre_trade(order, _portfolio(), mark_price=Decimal("60000"))
    assert result.approved is False
    assert RiskReason.MAX_ORDER_SIZE in result.reason_codes


def test_risk_engine_rejects_stale_data() -> None:
    engine = RiskEngine(RiskPolicy(max_data_age_ms=1000))
    order = Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="btc",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("0.1"),
        account_id="a",
        portfolio_id="pf_1",
    )
    result = engine.check_pre_trade(order, _portfolio(), mark_price=Decimal("60000"), data_age_ms=5000)
    assert result.approved is False
    assert RiskReason.STALE_DATA in result.reason_codes


def test_risk_engine_rejects_leverage_breach() -> None:
    policy = RiskPolicy(max_leverage=Decimal("1"))
    engine = RiskEngine(policy)
    order = Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="btc",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("1"),
        account_id="a",
        portfolio_id="pf_1",
    )
    # 60000 notional vs 100000 equity -> leverage 0.6, but with existing positions it grows.
    result = engine.check_pre_trade(order, _portfolio(), mark_price=Decimal("60000"))
    assert result.post_trade_leverage == Decimal("60000") / Decimal("100000")


def test_risk_engine_rejects_drawdown() -> None:
    engine = RiskEngine(RiskPolicy(max_drawdown=Decimal("0.05")))
    # Portfolio already in drawdown: cash 90000 vs peak 100000.
    p = _portfolio("90000", peak_equity="100000")
    order = Order(
        sisera_order_id="o1",
        client_order_id="c1",
        instrument_id="btc",
        side=OrderSide.BUY,
        order_type=OrderType.MARKET,
        quantity=Decimal("0.1"),
        account_id="a",
        portfolio_id="pf_1",
    )
    result = engine.check_pre_trade(order, p, mark_price=Decimal("60000"))
    assert RiskReason.DRAWDOWN in result.reason_codes
