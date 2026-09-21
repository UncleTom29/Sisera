"""Position Intelligence Engine. See SCOPE.md §12.

Re-checks open positions against their original Opportunity trade thesis:
- Thesis deterioration / invalidation condition triggers -> EXIT or REDUCE
- Thesis strengthening -> ADD
- Volatility / regime shifts -> TIGHTEN_STOP or WIDEN_STOP
"""

from __future__ import annotations

import logging

from sisera.data.models import NewsAssessment, OrderBook, Ticker
from sisera.indicators.composite import RegimeState, StabilityState
from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.position.models import PositionAction, PositionEvaluation
from sisera.risk.models import PortfolioState, Position

logger = logging.getLogger(__name__)


class PositionIntelligenceEngine:
    """Re-evaluates active positions against original trade thesis and dynamic market conditions."""

    def reevaluate(
        self,
        position: Position,
        opportunity: Opportunity,
        ticker: Ticker,
        regime_state: RegimeState,
        order_book: OrderBook | None = None,
        oi_pct_change_since_entry: float = 0.0,
        portfolio: PortfolioState | None = None,
        news: NewsAssessment | None = None,
        news_min_urgency: float = 0.5,
    ) -> PositionEvaluation:
        symbol = position.symbol
        current_price = ticker.last_price
        reason_codes: list[str] = []

        # 0. Breaking News Check (§1, §5) -- checked before the price stop, since the
        # whole point is to react ahead of (or without waiting for) price fully reflecting
        # the news. Graduated by severity rather than a single EXIT-or-nothing trigger:
        # `adverse_intensity` combines the model's own confidence (already source-reliability-
        # weighted -- see the news-triage system prompt in sisera/data/openrouter.py) with
        # how directionally adverse the news is for *this* position, so a single unconfirmed
        # claim reduces exposure rather than fully exiting on one unverified post, while a
        # high-confidence, high-severity read (e.g. corroborated across sources) can still
        # trigger a full exit. Never bypasses risk management to place a *new* opposing
        # position directly -- that goes through the normal scoring/decision/sizing pipeline
        # (see Orchestrator._evaluate_news_triggered_entry), just on an expedited cadence.
        if news is not None and news.urgency >= news_min_urgency:
            adverse_score = -news.score if position.direction == TradeDirection.LONG else news.score
            adverse_intensity = max(0.0, adverse_score) * news.confidence
            if adverse_intensity >= 0.5:
                return PositionEvaluation(
                    symbol=symbol,
                    action=PositionAction.EXIT,
                    reason_codes=["BREAKING_NEWS_ADVERSE"],
                    rationale=f"Breaking news thesis invalidation: {news.reasoning}",
                )
            if adverse_intensity >= 0.25:
                return PositionEvaluation(
                    symbol=symbol,
                    action=PositionAction.REDUCE,
                    reason_codes=["BREAKING_NEWS_ADVERSE"],
                    rationale=(
                        f"Breaking news raises risk but isn't fully confirmed; reducing "
                        f"exposure: {news.reasoning}"
                    ),
                    size_adjustment_factor=1.0 - adverse_intensity,
                )

        # 1. Price Stop Breach Check
        if position.direction == TradeDirection.LONG:
            active_stop = position.trailing_stop_price or position.stop_loss_price
            if current_price <= active_stop:
                return PositionEvaluation(
                    symbol=symbol,
                    action=PositionAction.EXIT,
                    reason_codes=["STOP_LOSS_BREACHED"],
                    rationale=(
                        f"Current price ({current_price:.2f}) breached active stop ({active_stop:.2f})"
                    ),
                )
        else:
            active_stop = position.trailing_stop_price or position.stop_loss_price
            if current_price >= active_stop:
                return PositionEvaluation(
                    symbol=symbol,
                    action=PositionAction.EXIT,
                    reason_codes=["STOP_LOSS_BREACHED"],
                    rationale=(
                        f"Current price ({current_price:.2f}) breached active stop ({active_stop:.2f})"
                    ),
                )

        # 2. Non-price Invalidation Conditions (§8, §12)
        for cond in opportunity.invalidation_conditions:
            is_oi_drop = (
                cond.condition_type == "OI_COLLAPSE"
                and oi_pct_change_since_entry <= cond.threshold_value
            )
            if is_oi_drop:
                reason_codes.append("OI_COLLAPSED")
            elif cond.condition_type == "FUNDING_FLIP":
                is_long_flip = (
                    position.direction == TradeDirection.LONG
                    and ticker.funding_rate >= cond.threshold_value
                )
                is_short_flip = (
                    position.direction == TradeDirection.SHORT
                    and ticker.funding_rate <= cond.threshold_value
                )
                if is_long_flip:
                    reason_codes.append("FUNDING_FLIPPED_AGAINST_LONG")
                elif is_short_flip:
                    reason_codes.append("FUNDING_FLIPPED_AGAINST_SHORT")
            elif (
                cond.condition_type == "REGIME_SHIFT"
                and regime_state.stability_score <= cond.threshold_value
            ):
                reason_codes.append("REGIME_DESTABILIZED")

        # 3. Decision Logic on Thesis State
        if "OI_COLLAPSED" in reason_codes and "FUNDING_FLIPPED_AGAINST_LONG" in reason_codes:
            # Thesis broken: early exit before hard stop hit
            return PositionEvaluation(
                symbol=symbol,
                action=PositionAction.EXIT,
                reason_codes=reason_codes,
                rationale=f"Early thesis invalidation: {','.join(reason_codes)}",
            )

        is_destabilized = (
            "REGIME_DESTABILIZED" in reason_codes
            or regime_state.stability == StabilityState.TRANSITIONING
        )
        if is_destabilized:
            # Market transitioning: tighten trailing stop to protect gains
            tightened_stop = (
                current_price * 0.985
                if position.direction == TradeDirection.LONG
                else current_price * 1.015
            )
            return PositionEvaluation(
                symbol=symbol,
                action=PositionAction.TIGHTEN_STOP,
                reason_codes=reason_codes or ["REGIME_TRANSITIONING"],
                rationale="Market regime destabilizing; tightening stop loss",
                suggested_stop_price=tightened_stop,
            )

        if "OI_COLLAPSED" in reason_codes:
            # Partial thesis deterioration: de-risk position by 50%
            return PositionEvaluation(
                symbol=symbol,
                action=PositionAction.REDUCE,
                reason_codes=["OI_COLLAPSED"],
                rationale="Open interest participation collapsed; reducing position size by 50%",
                size_adjustment_factor=0.5,
            )

        # 4. Thesis Strengthening Check
        if position.unrealized_pnl > position.margin * 0.40 and regime_state.stability_score >= 0.85:
            # In profit and regime strong -> candidate to ADD if portfolio capacity allows
            if portfolio and len(portfolio.open_positions) < 4:
                return PositionEvaluation(
                    symbol=symbol,
                    action=PositionAction.ADD,
                    reason_codes=["THESIS_CONFIRMED"],
                    rationale="Trade thesis strongly confirmed and in profit; adding to position",
                    size_adjustment_factor=1.25,
                )

        return PositionEvaluation(
            symbol=symbol,
            action=PositionAction.HOLD,
            reason_codes=["THESIS_INTACT"],
            rationale="Trade thesis intact and within parameters; continue holding",
        )
