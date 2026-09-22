"""Scoring and ranking data models. See SCOPE.md §7.

Preserves indicator-family breakdown, disagreement penalties, calibrated confidence,
independent risk score, expected value, and epistemic uncertainty.
"""

from __future__ import annotations

from dataclasses import field
from enum import StrEnum

from pydantic import BaseModel

from sisera_quant_indicators.composite import RegimeState


class IndicatorFamily(StrEnum):
    TECHNICAL = "technical"
    DERIVATIVES = "derivatives"
    OPTIONS = "options"
    FUNDAMENTAL = "fundamental"
    COMPOSITE = "composite"


class FamilyScore(BaseModel):
    family: IndicatorFamily
    score: float  # -1.0 to 1.0 (bearish to bullish)
    weight: float
    indicator_count: int
    agreement: float  # 0.0 to 1.0 (internal directional consensus)


class IndicatorFamilyScores(BaseModel):
    """Structured breakdown of scores per indicator family. See SCOPE.md §7."""

    families: dict[str, FamilyScore]
    cross_family_disagreement: float  # 0.0 (full agreement) to 1.0 (severe conflict)
    net_family_score: float  # -1.0 to 1.0


class PairScore(BaseModel):
    """Comprehensive score object for one pair and timeframe. See SCOPE.md §7.

    Confidence and Risk are independent axes. EV and Uncertainty are first-class fields.
    """

    symbol: str
    timeframe: str
    confidence: float  # 0.0 to 1.0 (calibrated strength of conviction)
    risk: float  # 0.0 to 1.0 (volatility, illiquidity, thin data, crowding)
    expected_value: float  # EV in R-units or %, e.g. +0.06 = +6% expected return
    epistemic_uncertainty: float  # 0.0 to 1.0 (width of conformal prediction interval)
    p_win: float  # 0.0 to 1.0 (calibrated win probability)
    data_confidence: float  # 0.0 to 1.0 (freshness, reconciliation agreement, coverage)
    family_breakdown: IndicatorFamilyScores
    regime_state: RegimeState
    raw_scores: dict[str, float] = field(default_factory=dict)
    reason_codes: list[str] = field(default_factory=list)

    @property
    def is_tradable_candidate(self) -> bool:
        """Preliminary check before Opportunity packaging and Decision Policy."""
        return self.confidence > 0.50 and self.risk < 0.85 and self.expected_value > 0.0


class RankedCandidate(BaseModel):
    """Pair candidate ranked across multiple timeframes."""

    symbol: str
    primary_timeframe: str
    composite_confidence: float
    composite_risk: float
    composite_ev: float
    composite_uncertainty: float
    timeframe_scores: dict[str, PairScore]
    rank: int
    data_confidence: float
    regime_stability: float
