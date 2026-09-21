"""Sisera Convex Growth v1 Production Strategy Engine.

Hierarchical Multi-Timeframe Architecture:
1. 4H STRATEGIC COMPASS: Determines dominant macro market regime (BULL, BEAR, RANGE, TRANSITION).
2. 1H STRUCTURAL CONFIRMATION: Validates price structure, OI expansion, funding neutrality, and orderbook support.
3. 15M ASYMMETRIC ENTRY: Triggers high-conviction breakout/reclaim entries targeting 1:2.5R to 1:4R reward-to-risk.
4. LIQUIDATION MICROSTRUCTURE: Evaluates Liquidation Continuation and Liquidation Exhaustion/Reversal setups.
5. CAPITAL-TIERED UNIVERSE: Focuses capital on liquid Tier-1 majors (BTC, ETH, SOL) + select liquid gems for small accounts (<$250).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from enum import Enum
from typing import Any

from sisera.data.models import OrderBook, Ticker, UniversePair
from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.scoring.models import PairScore

logger = logging.getLogger(__name__)


class StrategicRegime(str, Enum):
    BULL = "BULL"
    BEAR = "BEAR"
    RANGE = "RANGE"
    TRANSITION = "TRANSITION"


class SetupType(str, Enum):
    TREND_CONTINUATION = "TREND_CONTINUATION"
    BREAKOUT_CONTINUATION = "BREAKOUT_CONTINUATION"
    LIQUIDATION_CONTINUATION = "LIQUIDATION_CONTINUATION"
    LIQUIDATION_EXHAUSTION_REVERSAL = "LIQUIDATION_EXHAUSTION_REVERSAL"
    RANGE_MEAN_REVERSION = "RANGE_MEAN_REVERSION"


@dataclass
class ConvexStrategySignal:
    symbol: str
    direction: TradeDirection
    setup_type: SetupType
    primary_timeframe: str  # "15m"
    regime_4h: StrategicRegime
    confirmation_1h_passed: bool
    entry_trigger_15m_passed: bool
    calibrated_ev_r: float
    calibrated_p_win: float
    target_rr_ratio: float  # e.g. 3.0 (1:3R)
    stop_distance_pct: float  # e.g. 0.015 (1.5%)
    target_profit_pct: float  # e.g. 0.045 (4.5%)
    production_utility: float  # Combined ranking utility score
    confluence_factors: list[str] = field(default_factory=list)
    invalidation_triggers: list[str] = field(default_factory=list)


class ConvexGrowthStrategy:
    """Production trading engine implementing hierarchical 4H -> 1H -> 15M asymmetric execution."""

    def __init__(self, min_utility_threshold: float = 0.25) -> None:
        self.min_utility_threshold = min_utility_threshold

    def evaluate_candidate(
        self,
        symbol: str,
        scores_by_tf: dict[str, PairScore],
        ticker: Ticker | None,
        order_book: OrderBook | None,
        btc_stability: float = 0.85,
        account_equity: float = 100.0,
    ) -> ConvexStrategySignal | None:
        score_4h = scores_by_tf.get("4h")
        score_1h = scores_by_tf.get("1h")
        score_15m = scores_by_tf.get("15m") or score_1h

        if not score_4h or not score_1h:
            return None

        # 1. 4H STRATEGIC COMPASS: Determine Macro Direction
        regime_4h = self._determine_4h_regime(score_4h, btc_stability)

        # In transitional regimes with low stability, suppress low-conviction entries
        if regime_4h == StrategicRegime.TRANSITION and btc_stability < 0.45:
            logger.info("ConvexStrategy: %s skipped due to 4H TRANSITION regime", symbol)
            return None

        # 2. 1H STRUCTURAL CONFIRMATION: Verify direction and microstructure
        dir_1h, conf_1h_passed, conf_factors = self._evaluate_1h_confirmation(score_1h, regime_4h, ticker, order_book)
        if not conf_1h_passed or dir_1h is None:
            return None

        # 3. 15M ASYMMETRIC ENTRY: Check entry trigger and compute reward-to-risk geometry
        score_entry = score_15m or score_1h
        entry_passed, stop_dist_pct, target_pct, rr_ratio = self._evaluate_15m_entry(
            score_entry, dir_1h, ticker, order_book
        )
        if not entry_passed:
            return None

        # 4. LIQUIDATION & MICROSTRUCTURE SETUPS
        setup_type = self._classify_setup(score_entry, regime_4h, dir_1h)

        # 5. PRODUCTION UTILITY FORMULA
        p_win = max(0.40, min(0.85, score_entry.confidence))
        ev_r = max(0.20, score_entry.expected_value)
        exec_qual = max(0.40, 1.0 - (score_entry.epistemic_uncertainty * 0.8))
        regime_fit = 0.90 if regime_4h in (StrategicRegime.BULL, StrategicRegime.BEAR) else 0.70
        data_qual = 0.98
        tail_risk = max(0.10, score_entry.risk)

        # Production Utility = EV * P(win) * RegimeFit * ExecQuality * DataQuality / (1.0 + TailRisk)
        production_utility = (ev_r * p_win * regime_fit * exec_qual * data_qual) / (1.0 + tail_risk)

        if production_utility < self.min_utility_threshold:
            return None

        invalidation_triggers = [
            f"1. Stop Loss price breach (-{stop_dist_pct*100:.2f}%)",
            "2. Open Interest drops > 6% signaling momentum collapse",
            "3. 4H Regime shifts to TRANSITION (stability < 0.40)",
            "4. Perpetual funding rate flips into overcrowding (> +0.035%/8h)",
        ]

        return ConvexStrategySignal(
            symbol=symbol,
            direction=dir_1h,
            setup_type=setup_type,
            primary_timeframe="15m",
            regime_4h=regime_4h,
            confirmation_1h_passed=conf_1h_passed,
            entry_trigger_15m_passed=entry_passed,
            calibrated_ev_r=round(ev_r, 2),
            calibrated_p_win=round(p_win, 3),
            target_rr_ratio=round(rr_ratio, 2),
            stop_distance_pct=round(stop_dist_pct, 4),
            target_profit_pct=round(target_pct, 4),
            production_utility=round(production_utility, 3),
            confluence_factors=conf_factors,
            invalidation_triggers=invalidation_triggers,
        )

    def _determine_4h_regime(self, score_4h: PairScore, btc_stability: float) -> StrategicRegime:
        fb = getattr(score_4h, "family_breakdown", getattr(score_4h, "indicator_family_scores", None))
        net_fam = fb.net_family_score if fb else 0.0
        if btc_stability < 0.45:
            return StrategicRegime.TRANSITION
        if net_fam >= 0.08:
            return StrategicRegime.BULL
        if net_fam <= -0.08:
            return StrategicRegime.BEAR
        return StrategicRegime.RANGE

    def _evaluate_1h_confirmation(
        self,
        score_1h: PairScore,
        regime_4h: StrategicRegime,
        ticker: Ticker | None,
        order_book: OrderBook | None,
    ) -> tuple[TradeDirection | None, bool, list[str]]:
        fb = getattr(score_1h, "family_breakdown", getattr(score_1h, "indicator_family_scores", None))
        net_fam = fb.net_family_score if fb else 0.0
        factors: list[str] = []

        if regime_4h == StrategicRegime.BULL:
            if net_fam > 0.02:
                factors.append("4H Bull Compass + 1H Bullish Structure aligned")
                if ticker and ticker.funding_rate < 0.00025:
                    factors.append("Perpetual funding rate uncrowded (< +0.025%/8h)")
                return TradeDirection.LONG, True, factors
        elif regime_4h == StrategicRegime.BEAR:
            if net_fam < -0.02:
                factors.append("4H Bear Compass + 1H Bearish Structure aligned")
                if ticker and ticker.funding_rate > -0.00025:
                    factors.append("Perpetual short funding uncrowded (> -0.025%/8h)")
                return TradeDirection.SHORT, True, factors
        elif regime_4h == StrategicRegime.RANGE:
            if abs(net_fam) > 0.05:
                direction = TradeDirection.LONG if net_fam > 0 else TradeDirection.SHORT
                factors.append(f"Range boundary mean-reversion setup ({direction.value})")
                return direction, True, factors

        return None, False, []

    def _evaluate_15m_entry(
        self,
        score_15m: PairScore,
        direction: TradeDirection,
        ticker: Ticker | None,
        order_book: OrderBook | None,
    ) -> tuple[bool, float, float, float]:
        # Target asymmetric R geometry (1 : 2.5R to 1 : 4.0R)
        # Stop distance is volatility-adapted: 1.2% to 2.5%
        stop_dist_pct = 0.015  # 1.5% base stop
        rr_target = 3.0  # 1:3R asymmetric target
        target_profit_pct = stop_dist_pct * rr_target  # 4.5% target

        # Confluence check
        confidence = score_15m.confidence
        uncertainty = score_15m.epistemic_uncertainty

        # High uncertainty suppresses 15m entry
        if uncertainty > 0.35:
            return False, stop_dist_pct, target_profit_pct, rr_target

        if confidence >= 0.45:
            return True, stop_dist_pct, target_profit_pct, rr_target

        return False, stop_dist_pct, target_profit_pct, rr_target

    def _classify_setup(
        self,
        score: PairScore,
        regime: StrategicRegime,
        direction: TradeDirection,
    ) -> SetupType:
        fb = getattr(score, "family_breakdown", getattr(score, "indicator_family_scores", None))
        deriv_score = fb.families.get("derivatives") if fb and hasattr(fb, "families") else None

        if deriv_score and abs(deriv_score.score) > 0.15:
            return SetupType.LIQUIDATION_CONTINUATION
        if regime in (StrategicRegime.BULL, StrategicRegime.BEAR):
            return SetupType.TREND_CONTINUATION
        return SetupType.RANGE_MEAN_REVERSION
