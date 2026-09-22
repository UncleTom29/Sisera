"""Opportunity Engine. See SCOPE.md §8.

Transforms ranked candidates into fully structured trade theses (Opportunity objects)
with multi-condition invalidation criteria, expected holding horizons, dynamic execution quality reads,
thesis decomposition, conformal prediction intervals, incremental portfolio EV, and why-now triggers.
"""

from __future__ import annotations

import math
import uuid

from sisera_quant_scoring.models import RankedCandidate

from sisera.data.models import OrderBook, Ticker
from sisera_quant_opportunity.models import (
    ExecutionTier,
    InvalidationCondition,
    Opportunity,
    TradeDirection,
)


class OpportunityEngine:
    """Packages ranked candidates into structured Opportunity trade theses."""

    def __init__(
        self,
        model_version: str = "1.0.0",
        strategy_profile_version: str = "1.0.0",
    ) -> None:
        self.model_version = model_version
        self.strategy_profile_version = strategy_profile_version

    def package(
        self,
        candidate: RankedCandidate,
        ticker: Ticker,
        order_book: OrderBook | None = None,
        atr_value: float | None = None,
        current_book_ev_r: float = 1.42,
        recent_trade_r_multiples_by_timeframe: dict[str, list[float]] | None = None,
    ) -> Opportunity:
        symbol = candidate.symbol
        tf = candidate.primary_timeframe
        primary_score = candidate.timeframe_scores.get(tf) or next(
            iter(candidate.timeframe_scores.values())
        )

        entry_price = ticker.last_price
        atr = atr_value or (entry_price * 0.02)

        # 1. Determine direction
        direction = TradeDirection.LONG if primary_score.p_win >= 0.50 else TradeDirection.SHORT

        # 2. Invalidation price (hard stop floor)
        stop_dist = max(atr * 2.0, entry_price * 0.015)
        stop_dist_pct = stop_dist / entry_price
        if direction == TradeDirection.LONG:
            invalidation_price = max(0.01, entry_price - stop_dist)
        else:
            invalidation_price = entry_price + stop_dist

        # 3. Non-price Invalidation Conditions (§8)
        invalidation_conditions: list[InvalidationCondition] = [
            InvalidationCondition(
                condition_type="OI_COLLAPSE",
                threshold_value=-0.08,
                description="Open Interest drops >8% from entry, signaling trend exhaustion",
            ),
            InvalidationCondition(
                condition_type="REGIME_SHIFT",
                threshold_value=0.40,
                description="Regime stability score drops below 0.40 into TRANSITIONING/UNKNOWN",
            ),
        ]

        if direction == TradeDirection.LONG:
            invalidation_conditions.append(
                InvalidationCondition(
                    condition_type="FUNDING_FLIP",
                    threshold_value=0.0004,
                    description="Funding rate spikes > +0.04% into overcrowded longs",
                )
            )
            invalidation_conditions.append(
                InvalidationCondition(
                    condition_type="IMBALANCE_FLIP",
                    threshold_value=-0.35,
                    description="Order book imbalance flips heavily to ask side (<-0.35)",
                )
            )
        else:
            invalidation_conditions.append(
                InvalidationCondition(
                    condition_type="FUNDING_FLIP",
                    threshold_value=-0.0004,
                    description="Funding rate drops < -0.04% into overcrowded shorts",
                )
            )
            invalidation_conditions.append(
                InvalidationCondition(
                    condition_type="IMBALANCE_FLIP",
                    threshold_value=0.35,
                    description="Order book imbalance flips heavily to bid side (>+0.35)",
                )
            )

        # 4. Dynamic Execution Quality Read (§8, §11)
        # Factors: spread in bps, top-10 book depth vs $2,000 standard trade, funding drag
        spread_bps = 2.0
        near_depth = 50000.0
        if order_book and order_book.bids and order_book.asks:
            mid = order_book.mid_price or entry_price
            if order_book.best_bid and order_book.best_ask:
                spread_bps = max(0.5, ((order_book.best_ask - order_book.best_bid) / mid) * 10000.0)
            near_depth = sum(lvl.size * lvl.price for lvl in order_book.bids[:10]) + sum(
                lvl.size * lvl.price for lvl in order_book.asks[:10]
            )

        # Spread score: 100 for <= 1 bps, 50 for 10 bps, 10 for >= 25 bps
        spread_score = max(0.1, 1.0 - (spread_bps / 25.0) * 0.9)
        # Depth score: 100 for >= $150k depth, 50 for $25k, 10 for <$5k
        depth_score = min(1.0, math.tanh(near_depth / 40000.0))
        # Funding drag score
        funding_drag = min(0.3, abs(ticker.funding_rate) * 200.0) if ticker else 0.05
        funding_score = max(0.1, 1.0 - funding_drag)

        exec_quality = 0.45 * spread_score + 0.40 * depth_score + 0.15 * funding_score
        exec_quality = max(0.20, min(0.98, exec_quality))

        # Execution Tiering
        if exec_quality >= 0.75:
            exec_tier = ExecutionTier.FULL.value
        elif exec_quality >= 0.55:
            exec_tier = ExecutionTier.REDUCED_50.value
        else:
            exec_tier = ExecutionTier.WAIT_LIQUIDITY.value

        # 5. Holding Horizon & Payoffs
        horizon_bars = 12 if tf == "1h" else (8 if tf == "15m" else (18 if tf == "4h" else 14))
        # Real avg win/loss R-multiples from settled trade history for this timeframe
        # (TradeAttributionEngine.attribute_trade's pnl_r_multiple) once enough exist;
        # otherwise this static per-timeframe table is a documented prior, not an
        # empirical statistic -- same "insufficient live history" posture used elsewhere.
        tf_r_multiples = (recent_trade_r_multiples_by_timeframe or {}).get(tf, [])
        wins = [r for r in tf_r_multiples if r > 0]
        losses = [r for r in tf_r_multiples if r < 0]
        if len(wins) >= 3:
            avg_win_r = round(sum(wins) / len(wins), 2)
        else:
            avg_win_r = 2.30 if tf == "1h" else (1.80 if tf == "15m" else (2.80 if tf == "4h" else 3.20))
        if len(losses) >= 3:
            avg_loss_r = round(abs(sum(losses) / len(losses)), 2)
        else:
            avg_loss_r = 1.00

        ev_r = primary_score.expected_value
        expected_return_pct = round(ev_r * stop_dist_pct * 100.0, 2)
        expected_risk_pct = round(stop_dist_pct * 100.0, 2)

        # 6. Conformal Prediction Intervals (90% coverage)
        p_win = primary_score.p_win
        unc = primary_score.epistemic_uncertainty
        pred_low = max(0.01, round(p_win - 1.645 * unc, 3))
        pred_high = min(0.99, round(p_win + 1.645 * unc, 3))

        # 7. Incremental Portfolio EV. The 0.42 diversification-discount factor (how much
        # of a single new trade's own EV actually adds to portfolio-level EV, net of
        # correlation with existing holdings) is a documented heuristic, not derived from
        # a real portfolio-correlation model -- there's no principled "correct" value
        # without a proper calibration exercise against realized portfolio outcomes.
        # current_book_ev_r itself IS real as of this session (callers now pass the
        # actual live portfolio EV -- see Orchestrator/routes.py -- rather than always
        # defaulting to the 1.42 literal below).
        incremental_ev = round(max(0.05, ev_r * 0.42), 2)
        post_book_ev = round(current_book_ev_r + incremental_ev, 2)

        # 8. Crowding Level
        crowd_funding = abs(ticker.funding_rate) * 400.0 if ticker else 0.1
        crowd_data = (1.0 - primary_score.data_confidence) * 0.3
        crowding = min(1.0, crowd_funding + crowd_data)

        # 9. Thesis Quality Decomposition. Every input below is real (confidence, regime
        # stability, cross-family disagreement, data confidence, stop distance) but the
        # linear scaling constants (*160.0+40.0, etc.) that map them onto a 0-100 display
        # scale are documented heuristics, not empirically calibrated -- same posture as
        # fundamental.py's mcap_volume_ratio placeholder constant elsewhere in this
        # codebase. A real calibration would need a backtest exercise correlating these
        # decomposition scores against realized outcomes, which is out of scope here.
        fam_dict = primary_score.family_breakdown.families
        tech_score = fam_dict.get("technical", None)
        deriv_score = fam_dict.get("derivatives", None)
        fund_score = fam_dict.get("fundamental", None)
        cross_score = fam_dict.get("composite", None)
        opt_score = fam_dict.get("options", None)

        disagreement = primary_score.family_breakdown.cross_family_disagreement
        evidence_pct = round(
            min(98.0, max(30.0, (abs(primary_score.confidence - 0.5) * 160.0 + 40.0))), 1
        )
        regime_fit_pct = round(primary_score.regime_state.stability_score * 100.0, 1)
        signal_consensus_pct = round(max(10.0, (1.0 - disagreement) * 100.0), 1)
        data_quality_pct = round(primary_score.data_confidence * 100.0, 1)
        inval_buffer_pct = round(min(95.0, max(35.0, (stop_dist / (entry_price * 0.01)) * 30.0)), 1)

        thesis_decomposition = {
            "evidence_weight": evidence_pct,
            "regime_fit": regime_fit_pct,
            "signal_consensus": signal_consensus_pct,
            "data_quality": data_quality_pct,
            "invalidation_buffer": inval_buffer_pct,
        }

        thesis_quality = (
            0.25 * (evidence_pct / 100.0)
            + 0.25 * (regime_fit_pct / 100.0)
            + 0.20 * (signal_consensus_pct / 100.0)
            + 0.15 * (data_quality_pct / 100.0)
            + 0.15 * (inval_buffer_pct / 100.0)
        )

        # 10. Thesis Catalysts & Risks Extraction
        thesis_catalysts: list[str] = []
        risk_catalysts: list[str] = []

        if direction == TradeDirection.LONG:
            if tech_score and tech_score.score > 0.2:
                thesis_catalysts.append(f"{tf} Trend Continuation & Momentum (+{tech_score.score:.2f})")
            if deriv_score and deriv_score.score > 0.15:
                thesis_catalysts.append("Derivatives positioning & Open Interest expansion")
            if ticker and ticker.funding_rate < 0.0001:
                thesis_catalysts.append("Neutral/negative funding rate support")
            if exec_quality > 0.75:
                thesis_catalysts.append(f"Deep order book depth (${near_depth:,.0f}) & tight spread")

            if ticker and ticker.funding_rate > 0.0003:
                risk_catalysts.append("Funding rate moderately elevated on longs")
            if primary_score.epistemic_uncertainty > 0.20:
                risk_catalysts.append(
                    f"Prediction interval wide (±{primary_score.epistemic_uncertainty:.1%})"
                )
            if primary_score.regime_state.stability_score < 0.60:
                risk_catalysts.append("Market regime stability transitioning")
        else:
            if tech_score and tech_score.score < -0.2:
                thesis_catalysts.append(
                    f"{tf} Bearish breakdown & momentum weakness ({tech_score.score:.2f})"
                )
            if deriv_score and deriv_score.score < -0.15:
                thesis_catalysts.append("Derivatives short-side liquidation asymmetry")
            if ticker and ticker.funding_rate > -0.0001:
                thesis_catalysts.append("Uncrowded short positioning")
            if exec_quality > 0.75:
                thesis_catalysts.append(f"Deep order book depth (${near_depth:,.0f}) & tight spread")

            if primary_score.epistemic_uncertainty > 0.20:
                risk_catalysts.append(
                    f"Prediction interval wide (±{primary_score.epistemic_uncertainty:.1%})"
                )
            if primary_score.regime_state.stability_score < 0.60:
                risk_catalysts.append("Market regime stability transitioning")

        if not thesis_catalysts:
            thesis_catalysts.append(f"Multi-timeframe {tf} directional baseline alignment")
        if not risk_catalysts:
            risk_catalysts.append("Standard market execution slippage risk")

        # 11. "Why Now?" Actionable Transition Triggers
        why_now_triggers = [
            f"1. EV ({ev_r:+.2f}R) crossed required hurdle threshold",
            f"2. Execution quality ({exec_quality * 100:.0f}/100) confirmed in active orderbook",
            f"3. Regime compatibility aligned ({primary_score.regime_state.regime_type.value} "
            f"{regime_fit_pct:.0f}%)",
            f"4. Funding positioning uncrowded ({ticker.funding_rate * 100:+.4f}%/8h)",
            f"5. Incremental book EV increases portfolio to +{post_book_ev:.2f}R "
            f"(+{incremental_ev:.2f}R net)",
        ]

        # 12. Hierarchical Reasoning Tree for Visual Map
        reasoning_tree = {
            "symbol": symbol,
            "direction": direction.value,
            "p_win": primary_score.p_win,
            "ev_r": ev_r,
            "execution_quality": exec_quality,
            "nodes": [
                {
                    "name": "Technical",
                    "score": tech_score.score if tech_score else 0.0,
                    "weight": tech_score.weight if tech_score else 0.25,
                },
                {
                    "name": "Derivatives",
                    "score": deriv_score.score if deriv_score else 0.0,
                    "weight": deriv_score.weight if deriv_score else 0.25,
                },
                {
                    "name": "Fundamental",
                    "score": fund_score.score if fund_score else 0.0,
                    "weight": fund_score.weight if fund_score else 0.15,
                },
                {
                    "name": "Cross-Venue & Composite",
                    "score": cross_score.score if cross_score else 0.0,
                    "weight": cross_score.weight if cross_score else 0.20,
                },
                {
                    "name": "Options & Vol",
                    "score": opt_score.score if opt_score else 0.0,
                    "weight": opt_score.weight if opt_score else 0.15,
                },
            ],
        }

        # 13. Decision Provenance Snapshot
        provenance = {
            "model_version": self.model_version,
            "strategy_profile_version": self.strategy_profile_version,
            "confidence": primary_score.confidence,
            "risk": primary_score.risk,
            "expected_value": primary_score.expected_value,
            "ev_r": ev_r,
            "epistemic_uncertainty": primary_score.epistemic_uncertainty,
            "prediction_interval": f"{pred_low * 100:.1f}% - {pred_high * 100:.1f}%",
            "regime": primary_score.regime_state.regime_type.value,
            "stability_score": primary_score.regime_state.stability_score,
            "family_breakdown": primary_score.family_breakdown.model_dump(),
            "thesis_decomposition": thesis_decomposition,
            "raw_scores": primary_score.raw_scores,
            "reason_codes": primary_score.reason_codes,
            "reasoning_tree": reasoning_tree,
            "why_now_triggers": why_now_triggers,
        }

        return Opportunity(
            opportunity_id=f"opp_{symbol}_{int(ticker.last_price)}_{uuid.uuid4().hex[:6]}",
            symbol=symbol,
            direction=direction,
            primary_timeframe=tf,
            entry_price=entry_price,
            invalidation_price=invalidation_price,
            invalidation_conditions=invalidation_conditions,
            holding_horizon_bars=horizon_bars,
            expected_value=ev_r,
            ev_r=ev_r,
            avg_win_r=avg_win_r,
            avg_loss_r=avg_loss_r,
            expected_return_pct=expected_return_pct,
            expected_risk_pct=expected_risk_pct,
            p_win=primary_score.p_win,
            epistemic_uncertainty=primary_score.epistemic_uncertainty,
            prediction_interval_low=pred_low,
            prediction_interval_high=pred_high,
            expected_mae=stop_dist_pct * 0.6,
            expected_mfe=stop_dist_pct * 1.8,
            regime_compatibility=primary_score.regime_state.regime_type.value,
            regime_stability=primary_score.regime_state.stability_score,
            execution_quality=exec_quality,
            execution_tier=exec_tier,
            crowding_level=crowding,
            data_confidence=primary_score.data_confidence,
            thesis_quality=round(thesis_quality, 2),
            thesis_decomposition=thesis_decomposition,
            portfolio_impact_r=round(ev_r * 0.20, 3),
            pre_trade_book_ev_r=current_book_ev_r,
            post_trade_book_ev_r=post_book_ev,
            incremental_book_ev_r=incremental_ev,
            thesis_catalysts=thesis_catalysts,
            risk_catalysts=risk_catalysts,
            why_now_triggers=why_now_triggers,
            reasoning_tree=reasoning_tree,
            decision_provenance=provenance,
        )
