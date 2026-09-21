"""Market Memory data models. See SCOPE.md §6."""

from __future__ import annotations

import time

from pydantic import BaseModel, Field


class MarketStateSnapshot(BaseModel):
    """Historical state snapshot stored in Market Memory."""

    snapshot_id: str
    symbol: str
    timeframe: str
    feature_vector: list[float]
    forward_return: float = 0.0
    forward_mae: float = 0.0
    best_profile_timeframe: str = "1h"
    timestamp_ms: int = Field(default_factory=lambda: int(time.time() * 1000))


class AnalogMatch(BaseModel):
    snapshot: MarketStateSnapshot
    similarity_distance: float
    forward_return: float
    forward_mae: float


class AnalogQueryResult(BaseModel):
    """Output of Market Memory query. See SCOPE.md §6."""

    has_analogs: bool
    matched_count: int
    continuation_rate: float
    median_forward_return: float
    median_mae: float
    best_strategy_profile: str
    matches: list[AnalogMatch] = Field(default_factory=list)
