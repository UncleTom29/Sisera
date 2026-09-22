"""Property-based and unit tests for the canonical domain financial types (ADR-002)."""

from __future__ import annotations

from decimal import Decimal

import pytest
from hypothesis import given
from hypothesis import strategies as st
from sisera_domain import (
    Asset,
    Money,
    Percentage,
    Price,
    Quantity,
    quantize_to_step,
    round_quantity_to_lot,
)

# --------------------------------------------------------------------------- #
# Asset
# --------------------------------------------------------------------------- #


def test_asset_normalizes_uppercase() -> None:
    assert Asset(code="btc").code == "BTC"
    assert Asset(code=" Usdc ").code == "USDC"


def test_asset_rejects_blank() -> None:
    with pytest.raises(ValueError):
        Asset(code="   ")


def test_asset_equality_and_hash() -> None:
    assert Asset(code="btc") == Asset(code="BTC")
    assert hash(Asset(code="btc")) == hash(Asset(code="BTC"))


# --------------------------------------------------------------------------- #
# Money
# --------------------------------------------------------------------------- #


def test_money_constructs_from_multiple_types() -> None:
    assert Money("1.10", "USDT").amount == Decimal("1.10")
    assert Money(Decimal("2"), Asset(code="BTC")).amount == Decimal("2")
    assert Money(3, "USDT").amount == Decimal("3")


def test_money_addition_requires_same_asset() -> None:
    a = Money("1.00", "USDT")
    b = Money("0.50", "USDT")
    assert a + b == Money("1.50", "USDT")


def test_money_cross_asset_addition_raises() -> None:
    with pytest.raises(ValueError):
        Money("1.00", "BTC") + Money("1.00", "USDT")


def test_money_scalar_arithmetic_preserves_asset() -> None:
    m = Money("10.00", "BTC")
    assert m * 2 == Money("20.00", "BTC")
    assert m / 4 == Money("2.50", "BTC")
    assert -m == Money("-10.00", "BTC")
    assert abs(-m) == Money("10.00", "BTC")


def test_money_ratio() -> None:
    assert Money("3.00", "BTC").ratio(Money("6.00", "BTC")) == Decimal("0.5")


def test_money_ratio_cross_asset_raises() -> None:
    with pytest.raises(ValueError):
        Money("3.00", "BTC").ratio(Money("6.00", "USDT"))


def test_money_equality_is_exact() -> None:
    # 0.1 + 0.2 is not representable in binary float but is exact in Decimal.
    assert Money("0.1", "USDT") + Money("0.2", "USDT") == Money("0.3", "USDT")


@given(
    st.decimals(min_value=0, max_value=1_000_000, places=8),
    st.text(alphabet="AB", min_size=1, max_size=4),
)
def test_money_addition_commutative_and_associative(amount: Decimal, code: str) -> None:
    asset = Asset(code=code or "A")
    a = Money(amount, asset)
    b = Money(Decimal("1.0"), asset)
    c = Money(Decimal("2.0"), asset)
    assert a + b == b + a
    assert (a + b) + c == a + (b + c)


@given(
    st.decimals(min_value=0, max_value=1_000_000, places=6),
    st.decimals(min_value=0, max_value=1_000_000, places=6),
)
def test_money_addition_never_cross_asset(x: Decimal, y: Decimal) -> None:
    # Two different assets must never add silently.
    a = Money(x, "BTC")
    b = Money(y, "USDT")
    with pytest.raises(ValueError):
        a + b


# --------------------------------------------------------------------------- #
# Quantity
# --------------------------------------------------------------------------- #


def test_quantity_unit_safety() -> None:
    q = Quantity("5", "BTC")
    assert q + Quantity("5", "BTC") == Quantity("10", "BTC")
    with pytest.raises(ValueError):
        q + Quantity("5", "ETH")


# --------------------------------------------------------------------------- #
# Price
# --------------------------------------------------------------------------- #


def test_price_multiplied_by_quantity_yields_quote_money() -> None:
    p = Price("64250", base="BTC", quote="USDT")
    q = Quantity("2", "BTC")
    assert p * q == Money("128500", "USDT")


def test_price_rejects_wrong_quantity_unit() -> None:
    p = Price("64250", base="BTC", quote="USDT")
    with pytest.raises(ValueError):
        p * Quantity("2", "ETH")


def test_price_cross_pairing_comparison_raises() -> None:
    btc_usdt = Price("64250", "BTC", "USDT")
    eth_usdt = Price("3400", "ETH", "USDT")
    with pytest.raises(ValueError):
        _ = btc_usdt < eth_usdt


# --------------------------------------------------------------------------- #
# Percentage
# --------------------------------------------------------------------------- #


def test_percentage() -> None:
    p = Percentage.from_percent("5")
    assert p.value == Decimal("0.05")
    assert p.as_percent == Decimal("5")
    assert p.of(Money("100", "USDT")) == Money("5", "USDT")


# --------------------------------------------------------------------------- #
# Quantization
# --------------------------------------------------------------------------- #


def test_quantize_rounds_down_to_step() -> None:
    assert quantize_to_step("1.234", "0.01") == Decimal("1.23")
    assert quantize_to_step("1.239", "0.01") == Decimal("1.23")
    assert quantize_to_step("9", "3") == Decimal("9")


def test_quantize_negative_rounds_toward_zero() -> None:
    # Toward zero, not toward negative infinity: -1.239 -> -1.23
    assert quantize_to_step("-1.239", "0.01") == Decimal("-1.23")


def test_quantize_rejects_non_positive_step() -> None:
    with pytest.raises(ValueError):
        quantize_to_step("1", "0")
    with pytest.raises(ValueError):
        quantize_to_step("1", "-0.01")


@given(
    st.decimals(min_value=-1_000_000, max_value=1_000_000, places=4),
    st.integers(min_value=1, max_value=10000),
)
def test_quantize_always_multiple_of_step(value: Decimal, step_n: int) -> None:
    step = Decimal(step_n) / 1000
    out = quantize_to_step(value, step)
    assert out / step == out / step  # no-op sanity
    assert (out % step) == 0


def test_round_quantity_to_lot_is_quantize_alias() -> None:
    assert round_quantity_to_lot("7", "2") == Decimal("6")
