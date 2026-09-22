"""Tests for Transaction Cost Analysis (spec §19)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import Asset, FillRecord, Money, OrderSide, TCAEngine


def _fill(**overrides: object) -> FillRecord:
    base: dict[str, object] = {
        "order_id": "o1",
        "side": OrderSide.BUY,
        "instrument_id": "btc",
        "quantity": Decimal("1"),
        "ordered_quantity": Decimal("1"),
        "execution_price": Decimal("60050"),
        "decision_price": Decimal("60000"),
        "arrival_price": Decimal("60020"),
        "mid_price": Decimal("60010"),
        "fees": Money(Decimal("30"), Asset("USDT")),
    }
    base.update(overrides)
    return FillRecord(**base)  # type: ignore[arg-type]


def test_implementation_shortfall_is_positive_for_bad_buy() -> None:
    tca = TCAEngine().analyze(_fill())
    # Executed above decision price -> positive shortfall (cost).
    assert tca.implementation_shortfall_bps > 0


def test_slippage_vs_mid() -> None:
    tca = TCAEngine().analyze(_fill())
    assert tca.slippage_bps > 0  # bought above mid


def test_fill_ratio() -> None:
    tca = TCAEngine().analyze(_fill(quantity=Decimal("0.8"), ordered_quantity=Decimal("1")))
    assert tca.fill_ratio == Decimal("0.8")


def test_markout_passed_through() -> None:
    tca = TCAEngine().analyze(_fill(markout_1m=Decimal("0.001"), markout_5m=Decimal("0.002")))
    assert tca.markout_1m_bps == Decimal("10.00")
    assert tca.markout_5m_bps == Decimal("20.00")


def test_aggregate_maker_ratio() -> None:
    engine = TCAEngine()
    maker = _fill(order_id="o1", is_maker=True)
    taker = _fill(order_id="o2", is_maker=False)
    agg = engine.aggregate([maker, taker])
    assert agg["maker_ratio"] == Decimal("0.5")
    assert agg["fill_count"] == Decimal("2")


def test_short_side_sign_flips() -> None:
    engine = TCAEngine()
    short = _fill(
        side=OrderSide.SELL,
        execution_price=Decimal("59950"),  # sold below decision -> unfavorable
        decision_price=Decimal("60000"),
        arrival_price=Decimal("60020"),
        mid_price=Decimal("59990"),
    )
    tca = engine.analyze(short)
    assert tca.implementation_shortfall_bps > 0
