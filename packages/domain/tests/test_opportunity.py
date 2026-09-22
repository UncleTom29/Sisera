"""Tests for the canonical opportunity engine (spec §41)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import (
    MarketView,
    OpportunityEngine,
    OpportunityStructure,
)


def _view(**overrides: object) -> MarketView:
    base: dict[str, object] = {
        "instrument_id": "btc",
        "mid_price": Decimal("60000"),
        "signal": Decimal("0.8"),
        "confidence": Decimal("0.65"),
        "uncertainty": Decimal("0.15"),
        "expected_move": Decimal("0.04"),
        "stop_distance": Decimal("0.02"),
        "liquidity_score": Decimal("0.9"),
        "regime": "TRENDING",
    }
    base.update(overrides)
    return MarketView(**base)  # type: ignore[arg-type]


def test_strong_signal_produces_directional() -> None:
    opps = OpportunityEngine().evaluate(_view(), "o1")
    assert len(opps) == 1
    assert opps[0].structure == OpportunityStructure.DIRECTIONAL_PERP
    assert opps[0].direction == "LONG"
    assert opps[0].expected_value > 0


def test_weak_signal_produces_no_trade() -> None:
    opps = OpportunityEngine().evaluate(_view(signal=Decimal("0.01")), "o1")
    assert len(opps) == 1
    assert opps[0].structure == OpportunityStructure.NO_TRADE
    assert opps[0].direction is None


def test_high_uncertainty_blocks_trade() -> None:
    opps = OpportunityEngine().evaluate(_view(uncertainty=Decimal("0.9")), "o1")
    assert opps[0].structure == OpportunityStructure.NO_TRADE


def test_thin_liquidity_blocks_trade() -> None:
    opps = OpportunityEngine().evaluate(_view(liquidity_score=Decimal("0.1")), "o1")
    assert opps[0].structure == OpportunityStructure.NO_TRADE


def test_short_signal_produces_short() -> None:
    opps = OpportunityEngine().evaluate(_view(signal=Decimal("-0.8")), "o1")
    assert opps[0].direction == "SHORT"
