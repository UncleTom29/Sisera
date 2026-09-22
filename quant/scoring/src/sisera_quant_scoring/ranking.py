"""Ranking Engine. See SCOPE.md §7.

Aggregates per-timeframe PairScore objects into multi-timeframe candidate rankings,
ranking primarily on Confidence and Expected Value while preserving independent Risk.
"""

from __future__ import annotations

import logging

import numpy as np

from sisera.config import config
from sisera_quant_scoring.models import PairScore, RankedCandidate

logger = logging.getLogger(__name__)


class RankingEngine:
    """Multi-timeframe candidate ranking and risk filtration engine. See SCOPE.md §7."""

    def __init__(
        self,
        min_confidence: float | None = None,
        max_risk: float | None = None,
        max_uncertainty: float | None = None,
        timeframe_weights: dict[str, float] | None = None,
    ) -> None:
        self.min_confidence = min_confidence or config.min_candidate_confidence
        self.max_risk = max_risk or config.max_candidate_risk
        self.max_uncertainty = max_uncertainty or config.epistemic_uncertainty_threshold
        self.timeframe_weights = timeframe_weights or {
            "15m": 0.15,
            "1h": 0.45,
            "4h": 0.30,
            "1d": 0.10,
        }

    def rank(
        self,
        scores_by_pair: dict[str, dict[str, PairScore]],  # symbol -> {timeframe -> PairScore}
        primary_timeframe: str = "1h",
    ) -> list[RankedCandidate]:
        """Ranks all pairs by multi-timeframe composite score and filters ineligible candidates."""
        candidates: list[RankedCandidate] = []

        for symbol, tf_map in scores_by_pair.items():
            if not tf_map:
                continue

            primary_score = tf_map.get(primary_timeframe) or next(iter(tf_map.values()))

            # Compute weighted composite metrics across available timeframes
            weights = []
            conf_vals = []
            risk_vals = []
            ev_vals = []
            unc_vals = []

            for tf, ps in tf_map.items():
                w = self.timeframe_weights.get(tf, 0.25)
                weights.append(w)
                conf_vals.append(ps.confidence)
                risk_vals.append(ps.risk)
                ev_vals.append(ps.expected_value)
                unc_vals.append(ps.epistemic_uncertainty)

            total_w = sum(weights)
            norm_w = [w / total_w for w in weights]

            comp_conf = float(np.sum([c * w for c, w in zip(conf_vals, norm_w, strict=False)]))
            comp_risk = float(np.sum([r * w for r, w in zip(risk_vals, norm_w, strict=False)]))
            comp_ev = float(np.sum([e * w for e, w in zip(ev_vals, norm_w, strict=False)]))
            comp_unc = float(np.sum([u * w for u, w in zip(unc_vals, norm_w, strict=False)]))

            # Alignment bonus / penalty: if multiple timeframes agree on direction, boost confidence
            if len(tf_map) >= 2:
                dirs = [ps.p_win > 0.5 for ps in tf_map.values()]
                if all(dirs) or not any(dirs):
                    # Multi-timeframe trend alignment
                    comp_conf = min(0.99, comp_conf * 1.08)
                else:
                    # Timeframe contradiction
                    comp_conf = max(0.01, comp_conf * 0.90)

            # Basic data sanity check
            if primary_score.data_confidence < 0.20:
                continue

            candidates.append(
                RankedCandidate(
                    symbol=symbol,
                    primary_timeframe=primary_timeframe,
                    composite_confidence=comp_conf,
                    composite_risk=comp_risk,
                    composite_ev=comp_ev,
                    composite_uncertainty=comp_unc,
                    timeframe_scores=tf_map,
                    rank=0,
                    data_confidence=primary_score.data_confidence,
                    regime_stability=primary_score.regime_state.stability_score,
                )
            )

        # Rank primarily by composite Expected Value and Confidence, then secondary on lower risk
        candidates.sort(
            key=lambda c: c.composite_ev * 0.6 + c.composite_confidence * 0.4 - c.composite_risk * 0.2,
            reverse=True,
        )

        for i, c in enumerate(candidates, start=1):
            c.rank = i

        return candidates
