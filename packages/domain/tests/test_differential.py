"""Tests for differential intelligence (spec §39)."""

from __future__ import annotations

from decimal import Decimal

from sisera_domain import (
    DifferentialEngine,
    FactorDirection,
    MarketFactor,
)


def _states() -> tuple[dict, dict]:
    previous = {
        MarketFactor.OPEN_INTEREST: Decimal("100"),
        MarketFactor.FUNDING: Decimal("0.0001"),
        MarketFactor.VOLATILITY: Decimal("50"),
    }
    current = {
        MarketFactor.OPEN_INTEREST: Decimal("106.2"),
        MarketFactor.FUNDING: Decimal("0.00012"),
        MarketFactor.VOLATILITY: Decimal("50"),
    }
    return previous, current


def test_diff_detects_significant_mover() -> None:
    engine = DifferentialEngine()
    prev, cur = _states()
    diff = engine.diff("btc", prev, cur)
    oi = next(f for f in diff.factors if f.factor == MarketFactor.OPEN_INTEREST)
    assert oi.direction == FactorDirection.UP
    assert oi.significant is True
    assert oi.change_pct == Decimal("6.2")


def test_flat_factor_is_not_significant() -> None:
    engine = DifferentialEngine()
    prev, cur = _states()
    diff = engine.diff("btc", prev, cur)
    vol = next(f for f in diff.factors if f.factor == MarketFactor.VOLATILITY)
    assert vol.direction == FactorDirection.FLAT
    assert vol.significant is False


def test_regime_change_flag() -> None:
    engine = DifferentialEngine()
    diff = engine.diff(
        "btc",
        {MarketFactor.PRICE_REGIME: Decimal("1")},
        {MarketFactor.PRICE_REGIME: Decimal("2")},
    )
    assert diff.regime_changed is True


def test_narrative_names_real_movers_only() -> None:
    engine = DifferentialEngine()
    prev, cur = _states()
    diff = engine.diff("BTC", prev, cur)
    text = engine.narrative(diff)
    assert "OPEN_INTEREST" in text
    assert "VOLATILITY" not in text  # flat, not a mover


def test_empty_diff_narrative() -> None:
    engine = DifferentialEngine()
    diff = engine.diff("BTC", {}, {})
    assert "no significant changes" in engine.narrative(diff)


def test_factor_enum_covers_spec() -> None:
    assert len(MarketFactor) == 15
