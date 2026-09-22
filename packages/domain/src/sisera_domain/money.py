"""Canonical financial value objects (ADR-002).

Every financial amount in Sisera is one of these types. They enforce unit/asset safety at
construction and arithmetic time, so a `Money` in BTC can never be silently added to a
`Money` in USDC, and a `Price` always carries its base/quote pairing.
"""

from __future__ import annotations

from decimal import ROUND_DOWN, Decimal, InvalidOperation

from pydantic import BaseModel, ConfigDict, field_validator

# Quantization always rounds toward zero on the *quantity* axis to avoid over-filling an
# order (rounding up could exceed available balance/position). Prices use the same helper
# with an explicit rounding context where relevant.
QUANTIZATION_ROUNDING = ROUND_DOWN


class Asset(BaseModel):
    """A currency, token, or unit of account, identified by a normalized code."""

    model_config = ConfigDict(frozen=True)

    code: str

    def __init__(self, code: str) -> None:
        super().__init__(code=code)

    @field_validator("code")
    @classmethod
    def _normalize(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Asset code must be a non-empty string")
        return v.strip().upper()

    def __str__(self) -> str:  # noqa: D105
        return self.code

    def __hash__(self) -> int:  # noqa: D105
        return hash(self.code)


class Money(BaseModel):
    """An amount of a single asset with exact (Decimal) arithmetic.

    Addition/subtraction require matching assets; comparison operators require matching
    assets. Multiplication/division by a scalar `Decimal` preserves the asset.
    """

    model_config = ConfigDict(frozen=True)

    amount: Decimal
    asset: Asset

    def __init__(self, amount: Decimal | int | str, asset: Asset | str) -> None:
        if isinstance(asset, str):
            asset = Asset(code=asset)
        super().__init__(amount=Decimal(amount), asset=asset)

    def _require_same_asset(self, other: Money) -> None:
        if self.asset != other.asset:
            raise ValueError(
                f"Cannot combine Money across assets: {self.asset} vs {other.asset}"
            )

    def __add__(self, other: Money) -> Money:
        self._require_same_asset(other)
        return Money(self.amount + other.amount, self.asset)

    def __sub__(self, other: Money) -> Money:
        self._require_same_asset(other)
        return Money(self.amount - other.amount, self.asset)

    def __neg__(self) -> Money:
        return Money(-self.amount, self.asset)

    def __abs__(self) -> Money:
        return Money(abs(self.amount), self.asset)

    def __mul__(self, scalar: Decimal | int) -> Money:
        return Money(self.amount * Decimal(scalar), self.asset)

    __rmul__ = __mul__

    def __truediv__(self, scalar: Decimal | int) -> Money:
        return Money(self.amount / Decimal(scalar), self.asset)

    def ratio(self, other: Money) -> Decimal:
        """Self / other as a dimensionless ratio (requires matching assets)."""
        self._require_same_asset(other)
        if other.amount == 0:
            raise ZeroDivisionError("Cannot compute ratio against zero money")
        return self.amount / other.amount

    def rounded(self, places: int = 2) -> Money:
        return Money(self.amount.quantize(Decimal(1).scaleb(-places)), self.asset)

    @property
    def is_zero(self) -> bool:
        return self.amount == 0

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Money):
            return NotImplemented
        return self.asset == other.asset and self.amount == other.amount

    def __lt__(self, other: Money) -> bool:
        self._require_same_asset(other)
        return self.amount < other.amount

    def __le__(self, other: Money) -> bool:
        self._require_same_asset(other)
        return self.amount <= other.amount

    def __gt__(self, other: Money) -> bool:
        self._require_same_asset(other)
        return self.amount > other.amount

    def __ge__(self, other: Money) -> bool:
        self._require_same_asset(other)
        return self.amount >= other.amount

    def __hash__(self) -> int:  # noqa: D105
        return hash((self.amount, self.asset))


class Quantity(BaseModel):
    """A signed count of a base asset (contracts, coins, shares)."""

    model_config = ConfigDict(frozen=True)

    value: Decimal
    unit: Asset

    def __init__(self, value: Decimal | int | str, unit: Asset | str) -> None:
        if isinstance(unit, str):
            unit = Asset(code=unit)
        super().__init__(value=Decimal(value), unit=unit)

    def __add__(self, other: Quantity) -> Quantity:
        if self.unit != other.unit:
            raise ValueError(f"Cannot combine Quantity across units: {self.unit} vs {other.unit}")
        return Quantity(self.value + other.value, self.unit)

    def __sub__(self, other: Quantity) -> Quantity:
        if self.unit != other.unit:
            raise ValueError(f"Cannot combine Quantity across units: {self.unit} vs {other.unit}")
        return Quantity(self.value - other.value, self.unit)

    def __neg__(self) -> Quantity:
        return Quantity(-self.value, self.unit)

    @property
    def is_zero(self) -> bool:
        return self.value == 0

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Quantity):
            return NotImplemented
        return self.unit == other.unit and self.value == other.value

    def __hash__(self) -> int:  # noqa: D105
        return hash((self.value, self.unit))


class Price(BaseModel):
    """A price expressed as quote asset per unit of base asset.

    `Price(base=Asset("BTC"), quote=Asset("USDT"), value=Decimal("64250"))` reads
    "64250 USDT per BTC". Prices always carry their pairing so a BTC/USDT price can never
    be compared against an ETH/USDT price by accident.
    """

    model_config = ConfigDict(frozen=True)

    value: Decimal
    base: Asset
    quote: Asset

    def __init__(
        self,
        value: Decimal | int | str,
        base: Asset | str,
        quote: Asset | str,
    ) -> None:
        if isinstance(base, str):
            base = Asset(code=base)
        if isinstance(quote, str):
            quote = Asset(code=quote)
        super().__init__(value=Decimal(value), base=base, quote=quote)

    def _require_same_pairing(self, other: Price) -> None:
        if self.base != other.base or self.quote != other.quote:
            raise ValueError(
                f"Cannot compare prices across pairings: "
                f"{self.base}/{self.quote} vs {other.base}/{other.quote}"
            )

    def __mul__(self, qty: Quantity) -> Money:
        """Price * Quantity(base) -> Money(quote)."""
        if qty.unit != self.base:
            raise ValueError(
                f"Quantity unit {qty.unit} does not match price base {self.base}"
            )
        return Money(self.value * qty.value, self.quote)

    __rmul__ = __mul__

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Price):
            return NotImplemented
        return (
            self.base == other.base
            and self.quote == other.quote
            and self.value == other.value
        )

    def __lt__(self, other: Price) -> bool:
        self._require_same_pairing(other)
        return self.value < other.value

    def __le__(self, other: Price) -> bool:
        self._require_same_pairing(other)
        return self.value <= other.value

    def __gt__(self, other: Price) -> bool:
        self._require_same_pairing(other)
        return self.value > other.value

    def __ge__(self, other: Price) -> bool:
        self._require_same_pairing(other)
        return self.value >= other.value

    def __hash__(self) -> int:  # noqa: D105
        return hash((self.value, self.base, self.quote))


class Percentage(BaseModel):
    """A fractional ratio where 0.01 == 1%. Stored exactly as Decimal."""

    model_config = ConfigDict(frozen=True)

    value: Decimal

    def __init__(self, value: Decimal | int | str) -> None:
        super().__init__(value=Decimal(value))

    @classmethod
    def from_percent(cls, pct: Decimal | int | str) -> Percentage:
        return cls(Decimal(pct) / 100)

    @property
    def as_percent(self) -> Decimal:
        return self.value * 100

    def of(self, money: Money) -> Money:
        return money * self.value

    def __mul__(self, scalar: Decimal | int) -> Percentage:
        return Percentage(self.value * Decimal(scalar))

    def __eq__(self, other: object) -> bool:
        if not isinstance(other, Percentage):
            return NotImplemented
        return self.value == other.value

    def __hash__(self) -> int:  # noqa: D105
        return hash(self.value)


def quantize_to_step(value: Decimal | int | str, step: Decimal | int | str) -> Decimal:
    """Round `value` down to the nearest multiple of `step` (tick/lot quantization).

    Uses ROUND_DOWN (toward zero) so we never round a quantity up past available balance.
    Raises on a non-positive step.
    """
    step_d = Decimal(step)
    if step_d <= 0:
        raise ValueError(f"Step must be positive, got {step_d}")
    value_d = Decimal(value)
    try:
        return (value_d / step_d).to_integral_value(rounding=QUANTIZATION_ROUNDING) * step_d
    except InvalidOperation as exc:
        raise ValueError(f"Could not quantize {value_d} to step {step_d}") from exc


def round_quantity_to_lot(
    value: Decimal | int | str, lot_size: Decimal | int | str
) -> Decimal:
    """Alias of `quantize_to_step` for contract/coin lot sizing."""
    return quantize_to_step(value, lot_size)
