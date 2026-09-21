"""Market Memory Engine. See SCOPE.md §6.

Structured historical-analog retrieval: encodes state feature vectors,
queries nearest neighbor historical patterns, and surfaces continuation rate,
median forward return, median MAE, and best historically performing strategy profile.
"""

from __future__ import annotations

import logging

import numpy as np

from sisera.config import config
from sisera.memory.models import (
    AnalogMatch,
    AnalogQueryResult,
    MarketStateSnapshot,
)

logger = logging.getLogger(__name__)


class MarketMemory:
    """Historical-analog pattern retrieval engine. See SCOPE.md §6."""

    def __init__(
        self,
        k_neighbors: int | None = None,
        min_history_threshold: int | None = None,
    ) -> None:
        self.k_neighbors = k_neighbors or config.memory_k_neighbors
        self.min_history = min_history_threshold or config.memory_min_history
        self._snapshots: list[MarketStateSnapshot] = []

    def record_state(self, snapshot: MarketStateSnapshot) -> None:
        self._snapshots.append(snapshot)

    def size(self) -> int:
        return len(self._snapshots)

    def query_analogs(
        self,
        query_vector: np.ndarray | list[float],
        symbol: str | None = None,
        timeframe: str | None = None,
    ) -> AnalogQueryResult:
        """Finds k nearest historical state vectors and computes empirical analog statistics."""
        q_vec = np.array(query_vector, dtype=float)

        candidates = self._snapshots
        if symbol is not None:
            symbol_candidates = [s for s in candidates if s.symbol == symbol]
            if len(symbol_candidates) >= self.min_history:
                candidates = symbol_candidates

        if len(candidates) < self.min_history:
            return AnalogQueryResult(
                has_analogs=False,
                matched_count=len(candidates),
                continuation_rate=0.50,
                median_forward_return=0.0,
                median_mae=0.02,
                best_strategy_profile="1h",
                matches=[],
            )

        # Compute Euclidean distances
        distances = []
        for snap in candidates:
            s_vec = np.array(snap.feature_vector, dtype=float)
            if len(s_vec) != len(q_vec):
                continue
            dist = float(np.linalg.norm(q_vec - s_vec))
            distances.append((dist, snap))

        if not distances:
            return AnalogQueryResult(
                has_analogs=False,
                matched_count=0,
                continuation_rate=0.50,
                median_forward_return=0.0,
                median_mae=0.02,
                best_strategy_profile="1h",
            )

        distances.sort(key=lambda x: x[0])
        top_k = distances[: self.k_neighbors]

        matches: list[AnalogMatch] = [
            AnalogMatch(
                snapshot=snap,
                similarity_distance=dist,
                forward_return=snap.forward_return,
                forward_mae=snap.forward_mae,
            )
            for dist, snap in top_k
        ]

        returns = [m.forward_return for m in matches]
        maes = [m.forward_mae for m in matches]
        continuation_count = sum(1 for r in returns if r > 0)
        continuation_rate = continuation_count / len(returns)

        # Mode of best strategy profile
        profiles = [m.snapshot.best_profile_timeframe for m in matches]
        best_profile = max(set(profiles), key=profiles.count)

        return AnalogQueryResult(
            has_analogs=True,
            matched_count=len(matches),
            continuation_rate=continuation_rate,
            median_forward_return=float(np.median(returns)),
            median_mae=float(np.median(maes)),
            best_strategy_profile=best_profile,
            matches=matches,
        )
