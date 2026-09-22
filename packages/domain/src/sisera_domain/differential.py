"""Differential intelligence (spec §39).

Structured per-market state diffs across factors (price regime, volatility, funding, OI,
basis, liquidations, book imbalance, options skew, macro, onchain, flows, news,
prediction markets, correlation, portfolio relevance). The narrative is generated from
the real computed factors — never hallucinated — and the structured factors are stored
for audit.
"""

from __future__ import annotations

from decimal import Decimal
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field


class MarketFactor(StrEnum):
    PRICE_REGIME = "PRICE_REGIME"
    VOLATILITY = "VOLATILITY"
    FUNDING = "FUNDING"
    OPEN_INTEREST = "OPEN_INTEREST"
    BASIS = "BASIS"
    LIQUIDATIONS = "LIQUIDATIONS"
    BOOK_IMBALANCE = "BOOK_IMBALANCE"
    OPTIONS_SKEW = "OPTIONS_SKEW"
    MACRO = "MACRO"
    ONCHAIN = "ONCHAIN"
    FLOWS = "FLOWS"
    NEWS = "NEWS"
    PREDICTION = "PREDICTION"
    CORRELATION = "CORRELATION"
    PORTFOLIO = "PORTFOLIO"


class FactorDirection(StrEnum):
    UP = "UP"
    DOWN = "DOWN"
    FLAT = "FLAT"


class FactorReading(BaseModel):
    model_config = ConfigDict(frozen=True)

    factor: MarketFactor
    value: Decimal
    previous_value: Decimal
    direction: FactorDirection
    change_pct: Decimal
    significant: bool = False


class MarketDiff(BaseModel):
    model_config = ConfigDict(frozen=True)

    instrument_id: str
    timestamp_ms: int = 0
    factors: tuple[FactorReading, ...] = Field(default_factory=tuple)
    regime_changed: bool = False

    @property
    def movers(self) -> tuple[FactorReading, ...]:
        return tuple(f for f in self.factors if f.significant)


class DifferentialEngine:
    """Computes structured diffs between consecutive market-state snapshots."""

    def __init__(self, significance_threshold_pct: Decimal = Decimal("5")) -> None:
        self._threshold = significance_threshold_pct

    def diff(
        self,
        instrument_id: str,
        previous: dict[MarketFactor, Decimal],
        current: dict[MarketFactor, Decimal],
        timestamp_ms: int = 0,
    ) -> MarketDiff:
        readings: list[FactorReading] = []
        for factor in MarketFactor:
            if factor not in current:
                continue
            cur = current[factor]
            prev = previous.get(factor, cur)
            if prev == 0:
                change = Decimal("0") if cur == 0 else Decimal("100")
            else:
                change = (cur - prev) / abs(prev) * 100
            if cur > prev:
                direction = FactorDirection.UP
            elif cur < prev:
                direction = FactorDirection.DOWN
            else:
                direction = FactorDirection.FLAT
            readings.append(
                FactorReading(
                    factor=factor,
                    value=cur,
                    previous_value=prev,
                    direction=direction,
                    change_pct=change,
                    significant=abs(change) >= self._threshold,
                )
            )
        regime_changed = any(
            r.factor == MarketFactor.PRICE_REGIME and r.significant for r in readings
        )
        return MarketDiff(
            instrument_id=instrument_id,
            timestamp_ms=timestamp_ms,
            factors=tuple(readings),
            regime_changed=regime_changed,
        )

    def narrative(self, diff: MarketDiff) -> str:
        """Templated narrative naming only the computed significant movers."""
        if not diff.movers:
            return f"{diff.instrument_id}: no significant changes."
        if diff.regime_changed:
            lines = [f"{diff.instrument_id} regime changed."]
        else:
            lines = [f"{diff.instrument_id} update."]
        lines.append("Changes:")
        for m in diff.movers:
            sign = "+" if m.direction == FactorDirection.UP else "-"
            lines.append(f"{sign} {m.factor.value} moved {m.change_pct:.1f}%")
        return "\n".join(lines)
