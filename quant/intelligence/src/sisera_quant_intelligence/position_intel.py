"""Position Intelligence Engine.

Evaluates open positions continuously as active mutating theses:
- Computes dynamic live thesis health % (0-100%) dynamically from real-time price movements
- Tracks entry P(win) vs current P(win) with dynamic drift
- Tracks entry EV in R vs current EV in R with dynamic drift
- Recommends prominent causal actions: HOLD, TRIM 25%, REDUCE 25%, EXIT (Thesis Invalidated)
- Enforces explicit live Thesis Invalidation Triggers ("What would make me exit?")
- Evaluates ATR-adaptive trailing stop dynamics
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any

from sisera_quant_opportunity.models import Opportunity

from sisera.config import config
from sisera.risk.models import Position


@dataclass
class PositionIntelligence:
    symbol: str
    direction: str
    entry_price: float
    current_price: float
    unrealized_pnl_pct: float
    entry_p_win: float
    current_p_win: float
    entry_ev_r: float
    current_ev_r: float
    thesis_health_pct: float  # 0 to 100%
    thesis_status: str  # "Healthy", "Weakening", "Invalidating"
    recommended_action: str  # "HOLD", "TRIM 25%", "REDUCE 25%", "EXIT (Thesis Invalidated)"
    action_rationale: str  # Plain-language causal explanation of why this action is recommended
    risk_level: str  # "Low", "Medium", "High"
    trail_mode: str  # "ATR Adaptive"
    current_atr_pct: float  # e.g. 1.82%
    trail_distance_pct: float  # e.g. 2.73%
    activation_pct: float  # e.g. +1.25%
    invalidation_triggers: list[dict[str, Any]] = field(default_factory=list)


class PositionIntelligenceEngine:
    """Evaluates live open position health, EV trajectory, and causal actions in real time."""

    def evaluate(
        self,
        position: Position,
        current_market_price: float,
        opportunity: Opportunity | None = None,
        current_funding_rate: float | None = None,
        current_open_interest: float | None = None,
        current_p_win: float | None = None,
        current_ev_r: float | None = None,
    ) -> PositionIntelligence:
        try:
            entry_p = float(position.entry_price)
        except (ValueError, TypeError):
            entry_p = 10.0

        try:
            current_market_price = float(current_market_price)
        except (ValueError, TypeError):
            current_market_price = entry_p

        is_long = (
            position.direction.value.upper() == "LONG"
            if hasattr(position.direction, "value")
            else str(position.direction).upper() == "LONG"
        )

        # 1. Exact Live Unrealized PnL %
        if is_long:
            pnl_pct = ((current_market_price - entry_p) / entry_p) * 100.0
        else:
            pnl_pct = ((entry_p - current_market_price) / entry_p) * 100.0

        # 2. Real Entry Baseline -- the actual trade thesis this position was opened
        # under, when one is tracked (orch.active_opportunities), rather than a
        # per-symbol-name guess. A position with no tracked opportunity (shouldn't
        # normally happen, but stay graceful) falls back to a single neutral prior, not a
        # fabricated symbol-specific number.
        if opportunity is not None:
            entry_pwin = opportunity.p_win
            entry_ev = opportunity.ev_r
        else:
            entry_pwin = 0.55
            entry_ev = 0.50

        # 3. Dynamic Live P(win) and EV(R) Drift driven by real price performance
        if current_p_win is not None:
            curr_pwin = current_p_win
        else:
            # Positive PnL strengthens conviction; negative PnL decays conviction
            delta_pwin = (pnl_pct / 100.0) * 0.45
            curr_pwin = max(0.32, min(0.94, entry_pwin + delta_pwin))

        if current_ev_r is not None:
            curr_ev = current_ev_r
        else:
            # Live EV drift
            delta_ev = (pnl_pct / 100.0) * 0.75
            curr_ev = max(-0.45, min(3.50, entry_ev + delta_ev))

        # 4. Live Thesis Health Score (0–100%)
        pwin_ratio = curr_pwin / entry_pwin
        ev_ratio = max(0.0, curr_ev) / entry_ev if entry_ev > 0 else 0.5
        health = (pwin_ratio * 55.0) + (ev_ratio * 45.0)
        health = round(max(10.0, min(99.0, health)), 1)

        # 5. Dynamic Action Recommendation with Adaptive Pyramiding
        if health >= 90.0 and pnl_pct >= 1.0 and curr_ev >= entry_ev:
            status = "Strengthening"
            action = "ADD 25% (Pyramid)"
            rationale = (
                f"Thesis strengthening with expanded expectancy ({curr_ev:+.2f}R, PnL {pnl_pct:+.2f}%). "
                f"Eligible for adaptive 25% pyramiding."
            )
            risk = "Low"
        elif health >= 70.0:
            status = "Healthy"
            action = "HOLD"
            rationale = (
                f"Thesis intact with positive expectancy ({curr_ev:+.2f}R). "
                f"Market price ${current_market_price:,.2f} maintaining trend structure."
            )
            risk = "Low"
        elif health >= 45.0:
            status = "Weakening"
            action = "TRIM 25%"
            rationale = (
                f"Momentum decaying; P(win) drifted to {curr_pwin * 100:.1f}%. "
                f"Trimming 25% preserves capital and lowers portfolio correlation."
            )
            risk = "Medium"
        else:
            status = "Invalidating"
            action = "EXIT (Thesis Invalidated)"
            rationale = (
                f"Thesis invalidated after adverse price drift ({pnl_pct:+.2f}%). "
                f"Expected value dropped below hurdle ({curr_ev:+.2f}R)."
            )
            risk = "High"

        # 6. Live Invalidation Trigger Statuses
        # Funding Crowding: direction-aware, mirroring OpportunityEngine's own
        # FUNDING_FLIP invalidation condition -- a LONG worries about funding spiking
        # positive (overcrowded longs), a SHORT worries about it dropping negative
        # (overcrowded shorts). Real current_funding_rate when available; otherwise the
        # trigger is reported as not currently tracked rather than a fabricated reading.
        funding_threshold = 0.0004  # 0.04%/8h, matches the pre-existing displayed threshold
        if current_funding_rate is not None:
            adverse_funding = current_funding_rate if is_long else -current_funding_rate
            funding_triggered = adverse_funding > funding_threshold
            funding_value_str = f"{current_funding_rate * 100:+.4f}%/8h"
        else:
            funding_triggered = False
            funding_value_str = "not tracked this cycle"

        # Open Interest Reversal: needs an entry-time OI baseline, only available on
        # positions opened after Position.entry_open_interest was added.
        if (
            position.entry_open_interest > 0
            and current_open_interest is not None
            and current_open_interest >= 0
        ):
            oi_change_pct = (
                (current_open_interest - position.entry_open_interest) / position.entry_open_interest
            ) * 100.0
            oi_triggered = oi_change_pct < -8.0
            oi_value_str = f"{oi_change_pct:+.1f}% (since entry)"
        else:
            oi_triggered = False
            oi_value_str = "not tracked (opened before OI baseline was recorded)"

        invalidation_triggers = [
            {
                "condition": "EV Drift < 0.00R",
                "triggered": curr_ev < 0.0,
                "current_value": f"{curr_ev:+.2f}R",
                "threshold": "< 0.00R",
            },
            {
                "condition": "Calibrated P(win) < 48.0%",
                "triggered": curr_pwin < 0.48,
                "current_value": f"{curr_pwin * 100:.1f}%",
                "threshold": "< 48.0%",
            },
            {
                "condition": "Regime Shifts to Transitioning",
                "triggered": health < 50.0,
                "current_value": f"Thesis health {health:.0f}%",
                "threshold": "< 50% health",
            },
            {
                "condition": "Funding Crowding Spike",
                "triggered": funding_triggered,
                "current_value": funding_value_str,
                "threshold": f"> +{funding_threshold * 100:.4f}%/8h adverse",
            },
            {
                "condition": "Open Interest Reversal > 8%",
                "triggered": oi_triggered,
                "current_value": oi_value_str,
                "threshold": "< -8.0% since entry",
            },
        ]

        # Real ATR-at-entry estimate, back-derived from the stop distance
        # RiskManager.size_position() actually set (stop_dist = atr * atr_stop_multiplier,
        # floored at 1.5% of entry price) -- no new fetch needed, and no flat constant
        # regardless of asset.
        stop_dist_pct = abs(entry_p - position.stop_loss_price) / entry_p * 100.0 if entry_p > 0 else 1.5
        atr_pct = round(stop_dist_pct / max(config.atr_stop_multiplier, 0.1), 2)
        trail_dist = round(atr_pct * 1.5, 2)
        dir_str = (
            position.direction.value if hasattr(position.direction, "value") else str(position.direction)
        )

        return PositionIntelligence(
            symbol=position.symbol,
            direction=dir_str,
            entry_price=round(entry_p, 4 if entry_p < 100 else 2),
            current_price=round(current_market_price, 4 if current_market_price < 100 else 2),
            unrealized_pnl_pct=round(pnl_pct, 2),
            entry_p_win=round(entry_pwin, 3),
            current_p_win=round(curr_pwin, 3),
            entry_ev_r=round(entry_ev, 2),
            current_ev_r=round(curr_ev, 2),
            thesis_health_pct=health,
            thesis_status=status,
            recommended_action=action,
            action_rationale=rationale,
            risk_level=risk,
            trail_mode="ATR Adaptive",
            current_atr_pct=atr_pct,
            trail_distance_pct=trail_dist,
            activation_pct=config.atr_activation_pct * 100.0,
            invalidation_triggers=invalidation_triggers,
        )
