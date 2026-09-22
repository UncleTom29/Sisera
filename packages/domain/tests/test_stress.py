"""Tests for portfolio stress testing (spec §16)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import (
    Asset,
    Money,
    OrderSide,
    Portfolio,
    Position,
    Scenario,
    StressEngine,
)


def _position(
    iid: str, side: OrderSide = OrderSide.BUY, qty: str = "1", mark: str = "60000", beta: str = "1"
) -> Position:
    return Position(
        instrument_id=iid,
        side=side,
        quantity=Decimal(qty),
        entry_price=Decimal(mark),
        mark_price=Decimal(mark),
        beta_map={"BTC": Decimal(beta)},
    )


def _portfolio(*positions: Position) -> Portfolio:
    return Portfolio(
        portfolio_id="pf",
        name="main",
        quote_asset=Asset("USDT"),
        cash={"USDT": Money("100000", Asset("USDT"))},
        positions={p.instrument_id: p for p in positions},
        peak_equity=Decimal("100000"),
    )


def test_btc_crash_impact() -> None:
    engine = StressEngine()
    p = _portfolio(_position("btc", mark="60000"))
    scenario = Scenario(name="BTC -10%", shocks={"BTC": Decimal("-0.10")})
    impact = engine.stress(p, scenario)
    assert impact.total_pnl == Decimal("-6000")
    assert impact.projected_equity == Decimal("94000")


def test_short_position_gains_in_crash() -> None:
    engine = StressEngine()
    p = _portfolio(_position("btc", side=OrderSide.SELL, mark="60000"))
    scenario = Scenario(name="BTC -10%", shocks={"BTC": Decimal("-0.10")})
    impact = engine.stress(p, scenario)
    assert impact.total_pnl == Decimal("6000")


def test_beta_scales_impact() -> None:
    engine = StressEngine()
    p = _portfolio(_position("alt", mark="10000", beta="2"))
    scenario = Scenario(name="BTC -10%", shocks={"BTC": Decimal("-0.10")})
    impact = engine.stress(p, scenario)
    # alt has beta 2 -> -20% on 10000 notional -> -2000.
    assert impact.total_pnl == Decimal("-2000")


def test_margin_ratio_breach_detected() -> None:
    engine = StressEngine()
    pos = _position("btc", mark="60000")
    pos = pos.model_copy(update={"margin": Money("90000", Asset("USDT"))})
    p = _portfolio(pos)
    scenario = Scenario(name="BTC -10%", shocks={"BTC": Decimal("-0.10")})
    impact = engine.stress(p, scenario)
    assert impact.projected_margin_ratio > engine.margin_ratio_breach
    assert any("margin_ratio" in b for b in impact.breaches)


def test_by_factor_and_by_instrument_breakdown() -> None:
    engine = StressEngine()
    p = _portfolio(
        _position("btc", mark="60000"),
        _position("eth", qty="10", mark="3000", beta="0.5"),
    )
    scenario = Scenario(name="BTC -10%", shocks={"BTC": Decimal("-0.10")})
    impact = engine.stress(p, scenario)
    assert impact.by_instrument["btc"] == Decimal("-6000")
    assert impact.by_instrument["eth"] == Decimal("-1500")
    assert impact.by_factor["BTC"] == Decimal("-7500")


def test_multi_factor_scenario() -> None:
    engine = StressEngine()
    pos = Position(
        instrument_id="eth",
        side=OrderSide.BUY,
        quantity=Decimal("10"),
        entry_price=Decimal("3000"),
        mark_price=Decimal("3000"),
        beta_map={"ETH": Decimal("1"), "BTC": Decimal("0.5")},
    )
    p = _portfolio(pos)
    scenario = Scenario(name="risk-off", shocks={"ETH": Decimal("-0.08"), "BTC": Decimal("-0.10")})
    impact = engine.stress(p, scenario)
    # eth: -8% via ETH factor (-2400) + -5% via BTC factor (-1500) = -3900
    assert impact.total_pnl == Decimal("-3900")
