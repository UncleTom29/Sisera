"""Decision Policy. See SCOPE.md §8.

Evaluates trade opportunities via Expected Utility optimization with strict institutional hurdle gating:
U = EV_R - w_unc * uncertainty - w_exec * (1 - exec_qual) - w_tail * crowding - portfolio_penalty
Outputs selective, differentiated TRADE, WAIT, or NO_TRADE decisions with dynamic execution-aware sizing.
"""

from __future__ import annotations

import logging

from sisera_quant_opportunity.models import (
    AbstentionRecord,
    DecisionResult,
    DecisionType,
    ExecutionTier,
    Opportunity,
    TradeDirection,
)

logger = logging.getLogger(__name__)


class DecisionPolicy:
    """Expected-utility based decision policy. Ranking is not a decision (§8)."""

    def __init__(
        self,
        utility_threshold: float | None = None,
        min_execution_quality: float | None = None,
        max_uncertainty: float | None = None,
        min_ev_r: float | None = None,
        min_p_win: float | None = None,
    ) -> None:
        self.utility_threshold = utility_threshold if utility_threshold is not None else 0.08
        self.min_exec_quality = min_execution_quality if min_execution_quality is not None else 0.55
        self.max_uncertainty = max_uncertainty if max_uncertainty is not None else 0.25
        self.min_ev_r = min_ev_r if min_ev_r is not None else 0.05
        self.min_p_win = min_p_win if min_p_win is not None else 0.52
        self._abstention_records: list[AbstentionRecord] = []

    def decide(
        self,
        opportunity: Opportunity,
        portfolio_penalty: float = 0.0,
    ) -> DecisionResult:
        """Evaluates an Opportunity and returns TRADE, WAIT, or NO_TRADE with execution tiering."""
        reason_codes: list[str] = []

        # Expected Utility formulation in R-multiples (§8)
        unc_drag = 0.25 * opportunity.epistemic_uncertainty
        exec_drag = 0.20 * (1.0 - opportunity.execution_quality)
        tail_drag = 0.15 * opportunity.crowding_level

        # OpportunityEngine.package() always sets expected_value == ev_r from the same
        # ScoringEngine output, so expected_value is the single source of truth here.
        ev_val = opportunity.expected_value

        # opportunity.p_win is P(price up) (see OpportunityEngine.package, which picks
        # LONG iff p_win >= 0.50) -- not "P(the chosen trade wins)". For a SHORT, the win
        # probability of the trade actually taken is (1 - p_win); comparing raw p_win
        # against a >0.5-oriented threshold would flag every good short as low-confidence.
        is_long = opportunity.direction == TradeDirection.LONG
        effective_p_win = opportunity.p_win if is_long else 1.0 - opportunity.p_win

        expected_utility = (
            ev_val - unc_drag - exec_drag - tail_drag - portfolio_penalty
        )

        # Check individual gating hurdles
        passes_ev = ev_val >= self.min_ev_r
        passes_pwin = effective_p_win >= self.min_p_win
        passes_unc = opportunity.epistemic_uncertainty <= self.max_uncertainty
        passes_exec = opportunity.execution_quality >= self.min_exec_quality
        passes_regime = opportunity.regime_stability >= 0.45
        passes_utility = expected_utility >= self.utility_threshold

        if not passes_unc:
            reason_codes.append("HIGH_EPISTEMIC_UNCERTAINTY")
        if not passes_exec:
            reason_codes.append("POOR_EXECUTION_CONDITIONS")
        if not passes_regime:
            reason_codes.append("UNSTABLE_REGIME")
        if not passes_ev:
            reason_codes.append("SUB_THRESHOLD_EV")
        if not passes_pwin:
            reason_codes.append("LOW_CONFIDENCE")
        if not passes_utility:
            reason_codes.append("SUB_THRESHOLD_UTILITY")
        if opportunity.crowding_level > 0.60:
            reason_codes.append("CROWDED_POSITIONING")

        exec_tier = ExecutionTier.FULL.value
        size_pct = 1.0

        # Hard Safety Constraints (§8)
        min_ev_floor = min(self.min_ev_r, 0.05)
        is_critically_uncertain = opportunity.epistemic_uncertainty > 0.35
        is_unstable_regime = opportunity.regime_stability < 0.40

        if is_critically_uncertain or is_unstable_regime:
            decision = DecisionType.NO_TRADE
            size_pct = 0.0
            rationale = (
                f"NO_TRADE for {opportunity.symbol}: high tail risk or unstable regime "
                f"(EV=+{ev_val:.2f}R, P(win)={effective_p_win:.1%}, "
                f"reasons={','.join(reason_codes) if reason_codes else 'REGIME_OR_UNCERTAINTY'})"
            )
        elif not passes_exec and ev_val >= min_ev_floor:
            # Good thesis, poor immediate execution/orderbook conditions -> WAIT
            decision = DecisionType.WAIT
            size_pct = 0.0
            exec_tier = ExecutionTier.WAIT_LIQUIDITY.value
            rationale = (
                f"WAIT for {opportunity.symbol}: positive EV (+{ev_val:.2f}R) but execution quality ({opportunity.execution_quality*100:.0f}/100) "
                f"sub-optimal. Monitoring for orderbook liquidity improvement."
            )
        elif ev_val < min_ev_floor or (expected_utility < 0 and ev_val < 0.20):
            decision = DecisionType.NO_TRADE
            size_pct = 0.0
            rationale = (
                f"NO_TRADE for {opportunity.symbol}: edge insufficient after costs "
                f"(EV=+{ev_val:.2f}R, P(win)={effective_p_win:.1%}, "
                f"reasons={','.join(reason_codes) if reason_codes else 'NEGATIVE_EDGE'})"
            )
        elif (
            ev_val >= 0.75
            and effective_p_win >= 0.48
            and opportunity.execution_quality >= 0.80
            and opportunity.epistemic_uncertainty <= 0.22
        ):
            # Tier 1: Exceptional High-Conviction Opportunity (FULL 100%)
            decision = DecisionType.TRADE
            size_pct = 1.0
            exec_tier = ExecutionTier.FULL.value
            rationale = (
                f"FULL TRADE approved (100% size) for {opportunity.symbol} {opportunity.direction.value}: "
                f"High EV (+{ev_val:.2f}R), P(win)={effective_p_win:.1%}, "
                f"ExecQuality={opportunity.execution_quality*100:.0f}/100"
            )
        elif (
            ev_val >= 0.55
            and effective_p_win >= 0.44
            and opportunity.execution_quality >= 0.70
            and opportunity.epistemic_uncertainty <= 0.25
        ):
            # Tier 2: Strong Asymmetric Opportunity (REDUCED 75%)
            decision = DecisionType.TRADE
            size_pct = 0.75
            exec_tier = ExecutionTier.FULL.value
            rationale = (
                f"TRADE approved (75% size) for {opportunity.symbol} {opportunity.direction.value}: "
                f"EV=+{ev_val:.2f}R, P(win)={effective_p_win:.1%}, "
                f"ExecQuality={opportunity.execution_quality*100:.0f}/100"
            )
        elif ev_val >= 0.40 and effective_p_win >= 0.40 and opportunity.execution_quality >= 0.65:
            # Tier 3: Good Payoff Asymmetry Opportunity (REDUCED 50%)
            decision = DecisionType.TRADE
            size_pct = 0.50
            exec_tier = ExecutionTier.REDUCED_50.value
            rationale = (
                f"TRADE approved (50% size) for {opportunity.symbol} {opportunity.direction.value}: "
                f"EV=+{ev_val:.2f}R, P(win)={effective_p_win:.1%}, "
                f"ExecQuality={opportunity.execution_quality*100:.0f}/100"
            )
        elif ev_val >= 0.25 and effective_p_win >= 0.38 and opportunity.execution_quality >= 0.60:
            # Tier 4: Asymmetric Probe Position (PROBE 25%)
            decision = DecisionType.PROBE
            size_pct = 0.25
            exec_tier = ExecutionTier.REDUCED_50.value
            rationale = (
                f"PROBE approved (25% size) for {opportunity.symbol} {opportunity.direction.value}: "
                f"Positive EV (+{ev_val:.2f}R), P(win)={effective_p_win:.1%}, "
                f"ExecQuality={opportunity.execution_quality*100:.0f}/100"
            )
        elif passes_ev and passes_pwin and passes_exec and passes_regime and passes_utility:
            decision = DecisionType.TRADE
            size_pct = 0.50
            exec_tier = ExecutionTier.REDUCED_50.value
            rationale = (
                f"TRADE approved (50% size) for {opportunity.symbol} {opportunity.direction.value}: "
                f"EV=+{ev_val:.2f}R, P(win)={effective_p_win:.1%}, "
                f"ExecQuality={opportunity.execution_quality*100:.0f}/100"
            )
        else:
            decision = DecisionType.NO_TRADE
            size_pct = 0.0
            rationale = (
                f"NO_TRADE for {opportunity.symbol}: edge insufficient after costs "
                f"(EV=+{ev_val:.2f}R, P(win)={effective_p_win:.1%}, "
                f"reasons={','.join(reason_codes) if reason_codes else 'LOW_UTILITY'})"
            )

        res = DecisionResult(
            decision=decision,
            opportunity=opportunity,
            expected_utility=round(expected_utility, 4),
            reason_codes=reason_codes,
            rationale=rationale,
            execution_tier=exec_tier,
            recommended_size_pct=size_pct,
        )

        if decision in (DecisionType.WAIT, DecisionType.NO_TRADE, DecisionType.PROBE):
            self._abstention_records.append(
                AbstentionRecord(
                    decision_id=f"abs_{opportunity.symbol}_{res.timestamp_ms}",
                    symbol=opportunity.symbol,
                    decision=decision,
                    reason_codes=reason_codes,
                    opportunity=opportunity,
                )
            )

        return res

    def get_abstention_records(self) -> list[AbstentionRecord]:
        return list(self._abstention_records)
