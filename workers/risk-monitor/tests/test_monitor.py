"""Tests for the risk-monitor worker."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import (
    Asset,
    Channel,
    CircuitBreaker,
    InMemoryNotifier,
    KillScope,
    Money,
    NotificationService,
    OrderSide,
    Portfolio,
    Position,
)
from sisera_risk_monitor import RiskMonitor


def _portfolio(leverage_positions: bool = False) -> Portfolio:
    positions = {}
    if leverage_positions:
        # 200k notional on 100k equity -> 2x leverage.
        positions["btc"] = Position(
            instrument_id="btc",
            side=OrderSide.BUY,
            quantity=Decimal("2"),
            entry_price=Decimal("60000"),
            mark_price=Decimal("100000"),
        )
    return Portfolio(
        portfolio_id="pf_1",
        name="Main",
        quote_asset=Asset("USDT"),
        cash={"USDT": Money("100000", Asset("USDT"))},
        positions=positions,
        peak_equity=Decimal("100000"),
    )


class FixedPrices:
    def __init__(self, marks: dict[str, Decimal]) -> None:
        self._marks = marks

    def mark_price(self, instrument_id: str) -> Decimal | None:
        return self._marks.get(instrument_id)


def test_no_breach_on_healthy_portfolio() -> None:
    monitor = RiskMonitor()
    assert monitor.check(_portfolio(), FixedPrices({})) == []


def test_leverage_breach_trips_kill_switch() -> None:
    circuit = CircuitBreaker()
    mem = InMemoryNotifier()
    notifications = NotificationService()
    notifications.register(Channel.IN_APP, mem)
    monitor = RiskMonitor(
        max_leverage=Decimal("1.0"),
        max_concentration=Decimal("5"),
        circuit=circuit,
        notifications=notifications,
    )

    breaches = monitor.check(_portfolio(leverage_positions=True), FixedPrices({}))
    assert any("leverage" in b for b in breaches)
    assert circuit.is_blocked(KillScope.PORTFOLIO, "pf_1") is True
    assert len(mem.sent) >= 1


def test_mark_prices_refresh_positions() -> None:
    monitor = RiskMonitor(max_leverage=Decimal("100"), max_concentration=Decimal("5"))
    # Position marked up increases equity; no breach expected.
    breaches = monitor.check(
        _portfolio(leverage_positions=True), FixedPrices({"btc": Decimal("100000")})
    )
    assert breaches == []
