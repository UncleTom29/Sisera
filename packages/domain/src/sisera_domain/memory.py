"""Market memory (spec §42).

Stores historical market-state snapshots and retrieves the most similar past states to a
current configuration (nearest-neighbor on feature distance). Reports similarity,
subsequent returns, drawdowns, volatility, regime, sample count, and uncertainty — without
overstating analog reliability.
"""

from __future__ import annotations

import math
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class MarketState(BaseModel):
    model_config = ConfigDict(frozen=True)

    state_id: str
    timestamp_ms: int = 0
    features: dict[str, Decimal] = Field(default_factory=dict)
    regime: str | None = None
    forward_return: Decimal | None = None
    max_drawdown: Decimal | None = None
    volatility: Decimal | None = None


class AnalogResult(BaseModel):
    model_config = ConfigDict(frozen=True)

    state: MarketState
    distance: Decimal
    similarity: Decimal


class AnalogStats(BaseModel):
    model_config = ConfigDict(frozen=True)

    samples: int
    median_forward_return: Decimal | None = None
    win_rate: Decimal | None = None
    median_drawdown: Decimal | None = None
    regimes: tuple[str, ...] = ()


class MarketMemory:
    def __init__(self) -> None:
        self._states: list[MarketState] = []

    def store(self, state: MarketState) -> None:
        self._states.append(state)

    def __len__(self) -> int:
        return len(self._states)

    @staticmethod
    def _distance(a: dict[str, Decimal], b: dict[str, Decimal]) -> Decimal:
        keys = set(a) | set(b)
        if not keys:
            return Decimal("0")
        total = sum((a.get(k, Decimal("0")) - b.get(k, Decimal("0"))) ** 2 for k in keys)
        return Decimal(str(math.sqrt(float(total))))

    def query(self, features: dict[str, Decimal], k: int = 5) -> list[AnalogResult]:
        scored = [
            AnalogResult(
                state=s,
                distance=self._distance(features, s.features),
                similarity=Decimal("1") / (Decimal("1") + self._distance(features, s.features)),
            )
            for s in self._states
        ]
        scored.sort(key=lambda r: r.distance)
        return scored[:k]

    def outcome_stats(self, analogs: list[AnalogResult]) -> AnalogStats:
        returns = [a.state.forward_return for a in analogs if a.state.forward_return is not None]
        drawdowns = [a.state.max_drawdown for a in analogs if a.state.max_drawdown is not None]
        regimes = tuple(sorted({a.state.regime for a in analogs if a.state.regime}))
        if not returns:
            return AnalogStats(samples=len(analogs), regimes=regimes)
        ordered = sorted(returns)
        median = ordered[len(ordered) // 2]
        wins = sum(1 for r in returns if r > 0)
        median_dd = sorted(drawdowns)[len(drawdowns) // 2] if drawdowns else None
        return AnalogStats(
            samples=len(analogs),
            median_forward_return=median,
            win_rate=Decimal(wins) / len(returns),
            median_drawdown=median_dd,
            regimes=regimes,
        )
