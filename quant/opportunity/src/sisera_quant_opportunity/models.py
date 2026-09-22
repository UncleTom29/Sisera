"""Opportunity and Decision models. See SCOPE.md §8.

Packages ranked candidates into structured trade theses with explicit invalidation conditions,
expected holding horizons, epistemic uncertainty, execution quality, incremental book EV,
why-now transition catalysts, and decision provenance.
"""

from __future__ import annotations

import time
from dataclasses import dataclass
from enum import StrEnum
from typing import Any

from pydantic import BaseModel, Field


class TradeDirection(StrEnum):
    LONG = "LONG"
    SHORT = "SHORT"


class DecisionType(StrEnum):
    TRADE = "TRADE"
    PROBE = "PROBE"
    WAIT = "WAIT"
    NO_TRADE = "NO_TRADE"


class ExecutionTier(StrEnum):
    FULL = "FULL"
    REDUCED_50 = "REDUCED_50"
    WAIT_LIQUIDITY = "WAIT_LIQUIDITY"


class InvalidationCondition(BaseModel):
    condition_type: str  # "PRICE_BREAK", "OI_COLLAPSE", "FUNDING_FLIP", "REGIME_SHIFT", "IMBALANCE_FLIP"
    threshold_value: float
    description: str


class Opportunity(BaseModel):
    """Structured trade thesis object. See SCOPE.md §8.

    Shared as the decision provenance payload across live execution, decision ledger,
    and backtesting engine (§1).
    """

    opportunity_id: str
    symbol: str
    direction: TradeDirection
    primary_timeframe: str
    entry_price: float
    invalidation_price: float
    invalidation_conditions: list[InvalidationCondition]
    holding_horizon_bars: int
    expected_value: float  # EV in R-multiple (e.g. +0.84R)
    ev_r: float = 0.50  # Explicit R-multiple
    avg_win_r: float = 2.20  # Average Win payoff in R
    avg_loss_r: float = 1.00  # Average Loss payoff in R
    expected_return_pct: float = 2.50  # Expected percentage gain
    expected_risk_pct: float = 1.25  # Expected risk / stop distance %
    p_win: float  # Calibrated win probability
    epistemic_uncertainty: float  # Width of conformal interval (0.0 to 1.0)
    prediction_interval_low: float = 0.54  # 90% Conformal prediction interval lower bound
    prediction_interval_high: float = 0.77  # 90% Conformal prediction interval upper bound
    expected_mae: float = 0.02  # Maximum Adverse Excursion estimate
    expected_mfe: float = 0.05  # Maximum Favorable Excursion estimate
    regime_compatibility: str = "TRENDING"
    regime_stability: float = 1.0
    execution_quality: float = 0.8  # 0.0 to 1.0 (or 0 to 100 on UI)
    execution_tier: str = "FULL"  # "FULL", "REDUCED_50", "WAIT_LIQUIDITY"
    crowding_level: float = 0.2  # 0.0 to 1.0
    data_confidence: float = 0.9  # 0.0 to 1.0
    thesis_quality: float = 0.85  # 0.0 to 1.0
    thesis_decomposition: dict[str, float] = Field(
        default_factory=dict
    )  # Evidence, Regime Fit, Signal Consensus, etc.
    portfolio_impact_r: float = 0.15  # Incremental book EV in R
    pre_trade_book_ev_r: float = 1.42  # Current book EV before adding this position
    post_trade_book_ev_r: float = 1.83  # Projected book EV after adding this position
    incremental_book_ev_r: float = 0.41  # Net EV delta added to the portfolio
    thesis_catalysts: list[str] = Field(default_factory=list)
    risk_catalysts: list[str] = Field(default_factory=list)
    why_now_triggers: list[str] = Field(default_factory=list)  # Explicit reasons why actionable now
    reasoning_tree: dict[str, Any] = Field(default_factory=dict)
    timestamp_ms: int = Field(default_factory=lambda: int(time.time() * 1000))
    decision_provenance: dict[str, Any] = Field(default_factory=dict)


class DecisionResult(BaseModel):
    """Output of Decision Policy: TRADE, PROBE, WAIT, or NO_TRADE with expected
    utility and reason codes."""

    decision: DecisionType
    opportunity: Opportunity
    expected_utility: float
    reason_codes: list[str]
    rationale: str
    execution_tier: str = "FULL"
    recommended_size_pct: float = 1.0
    timestamp_ms: int = Field(default_factory=lambda: int(time.time() * 1000))


@dataclass
class AbstentionRecord:
    """Tracks a WAIT or NO_TRADE decision for learned abstention attribution (§8, §10)."""

    decision_id: str
    symbol: str
    decision: DecisionType
    reason_codes: list[str]
    opportunity: Opportunity
    post_decision_return_1h: float | None = None
    post_decision_return_4h: float | None = None
    post_decision_return_24h: float | None = None
    counterfactual_verdict: str | None = None  # "CORRECT_ABSTENTION" or "MISSED_OPPORTUNITY"
