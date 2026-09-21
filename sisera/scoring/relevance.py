"""Indicator Relevance & Pruning. See SCOPE.md §7.

Evaluates each indicator's marginal contribution to ranking accuracy and forward returns,
per (timeframe × cluster). Prunes indicators with near-zero or negative contribution
from live computation.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import numpy as np

from sisera.config import config

logger = logging.getLogger(__name__)


def classify_market_cap_cluster(market_cap_rank: int | None) -> str:
    """Classifies coin into market-cap cluster: large_cap (<=20), mid_cap (21-80), small_cap (81+)."""
    if market_cap_rank is None or market_cap_rank <= 20:
        return "large_cap"
    if market_cap_rank <= 80:
        return "mid_cap"
    return "small_cap"


@dataclass
class IndicatorRelevanceRecord:
    indicator_name: str
    timeframe: str
    cluster: str
    marginal_contribution_history: list[float] = field(default_factory=list)
    is_pruned: bool = False

    @property
    def latest_contribution(self) -> float:
        return self.marginal_contribution_history[-1] if self.marginal_contribution_history else 0.0

    @property
    def trend(self) -> float:
        if len(self.marginal_contribution_history) < 2:
            return self.latest_contribution
        # Linear slope across recent evaluations
        y = np.array(self.marginal_contribution_history[-5:])
        x = np.arange(len(y))
        slope, _ = np.polyfit(x, y, 1)
        return float(slope)


class IndicatorRelevancePruner:
    """Tracks and prunes indicators based on multi-snapshot marginal contribution trends."""

    def __init__(
        self,
        relevance_threshold: float | None = None,
        min_evaluations_before_prune: int = 3,
    ) -> None:
        self.relevance_threshold = relevance_threshold or config.relevance_threshold
        self.min_evaluations = min_evaluations_before_prune
        # Key: (timeframe, cluster, indicator_name)
        self._records: dict[tuple[str, str, str], IndicatorRelevanceRecord] = {}

    def record_evaluation(
        self,
        timeframe: str,
        cluster: str,
        indicator_name: str,
        marginal_contribution: float,
    ) -> None:
        key = (timeframe, cluster, indicator_name)
        if key not in self._records:
            self._records[key] = IndicatorRelevanceRecord(
                indicator_name=indicator_name,
                timeframe=timeframe,
                cluster=cluster,
            )
        rec = self._records[key]
        rec.marginal_contribution_history.append(marginal_contribution)

        # Multi-snapshot trend pruning decision
        if len(rec.marginal_contribution_history) >= self.min_evaluations:
            recent_avg = float(np.mean(rec.marginal_contribution_history[-self.min_evaluations :]))
            # Prune if average contribution is below threshold and trend is non-positive
            if recent_avg < self.relevance_threshold and rec.trend <= 0.0:
                rec.is_pruned = True
                logger.info(
                    "Pruned indicator %s for (%s x %s): avg_contrib=%.4f, trend=%.4f",
                    indicator_name,
                    timeframe,
                    cluster,
                    recent_avg,
                    rec.trend,
                )
            else:
                rec.is_pruned = False

    def get_pruned_indicators(self, timeframe: str, cluster: str) -> set[str]:
        pruned = set()
        for (tf, cl, ind_name), rec in self._records.items():
            if tf == timeframe and cl == cluster and rec.is_pruned:
                pruned.add(ind_name)
        return pruned

    def get_active_indicators(
        self, timeframe: str, cluster: str, full_indicator_set: set[str]
    ) -> set[str]:
        pruned = self.get_pruned_indicators(timeframe, cluster)
        return full_indicator_set - pruned
