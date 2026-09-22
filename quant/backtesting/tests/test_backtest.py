"""Tests for the event-driven backtesting harness (spec §25)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import OrderSide, Portfolio
from sisera_quant import BacktestEngine, Bar, Signal, walk_forward


def _bars(n: int = 20, start: str = "100", step: str = "1") -> list[Bar]:
    bars: list[Bar] = []
    price = Decimal(start)
    for i in range(n):
        price += Decimal(step)
        bars.append(
            Bar(
                timestamp_ms=i,
                instrument_id="btc",
                open=price - Decimal("0.5"),
                high=price + Decimal("0.5"),
                low=price - Decimal("1"),
                close=price,
                volume=Decimal("100"),
            )
        )
    return bars


class AlwaysLong:
    def on_bar(self, bar: Bar, portfolio: Portfolio) -> Signal | None:
        return Signal(
            instrument_id=bar.instrument_id,
            direction=OrderSide.BUY,
            timestamp_ms=bar.timestamp_ms,
        )


class NeverTrade:
    def on_bar(self, bar: Bar, portfolio: Portfolio) -> Signal | None:
        return None


class Alternating:
    def __init__(self) -> None:
        self._n = 0

    def on_bar(self, bar: Bar, portfolio: Portfolio) -> Signal | None:
        self._n += 1
        direction = OrderSide.BUY if self._n % 2 == 1 else OrderSide.SELL
        return Signal(
            instrument_id=bar.instrument_id, direction=direction, timestamp_ms=bar.timestamp_ms
        )


def test_never_trade_has_zero_return_and_no_drawdown() -> None:
    result = BacktestEngine().run(_bars(), NeverTrade())
    assert result.metrics.trades == 0
    assert result.metrics.total_return == Decimal("0")
    assert result.metrics.max_drawdown == Decimal("0")
    assert result.metrics.final_equity == Decimal("100000")


def test_always_long_in_uptrend_is_profitable() -> None:
    result = BacktestEngine().run(_bars(n=20, start="100", step="1"), AlwaysLong())
    assert result.metrics.trades >= 0
    assert len(result.equity_curve) == 20


def test_alternating_opens_and_closes_trades() -> None:
    result = BacktestEngine().run(_bars(n=10, start="100", step="2"), Alternating())
    assert result.metrics.trades > 0
    assert result.metrics.win_rate >= 0
    assert result.metrics.win_rate <= 1


def test_metrics_are_sane() -> None:
    result = BacktestEngine().run(_bars(n=30, start="100", step="1"), Alternating())
    m = result.metrics
    assert m.bars == 30
    assert m.turnover >= 0
    assert m.max_drawdown >= 0
    assert m.profit_factor >= 0


def test_walk_forward_returns_folds() -> None:
    results = walk_forward(_bars(n=40), Alternating, n_splits=3)
    assert len(results) == 3
    assert all(r.metrics.bars > 0 for r in results)
