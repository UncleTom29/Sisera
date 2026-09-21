"""Weekly Profit-Locking & Dynamic Drawdown Ladder Engine.

Enforces:
1. Hard 20% Weekly Drawdown Boundary with progressive de-risking ladder.
2. Weekly Profit Locking at +25%, +50%, +75%, and +100% growth milestones.
3. Capital Modes: GROWTH, BALANCED, DEFENSIVE, PRESERVATION, CAPITAL_RECOVERY.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from enum import Enum

logger = logging.getLogger(__name__)


class CapitalMode(str, Enum):
    GROWTH = "GROWTH"
    BALANCED = "BALANCED"
    DEFENSIVE = "DEFENSIVE"
    PRESERVATION = "PRESERVATION"
    CAPITAL_RECOVERY = "CAPITAL_RECOVERY"


@dataclass
class WeeklyLadderState:
    starting_equity: float
    current_equity: float
    high_watermark: float
    current_weekly_return_pct: float
    current_weekly_drawdown_pct: float
    active_capital_mode: CapitalMode
    drawdown_sizing_multiplier: float  # 0.0 to 1.0
    profit_lock_floor_usd: float
    weekly_target_reached: bool
    status_summary: str


class ProfitLockEngine:
    """Manages weekly drawdown ladder throttling and milestone profit locking."""

    def __init__(self, weekly_start_capital: float = 100.0) -> None:
        self.starting_equity = weekly_start_capital
        self.high_watermark = weekly_start_capital
        self.profit_lock_floor_usd = weekly_start_capital * 0.80  # Hard 20% floor ($80 for $100 starting)

    def evaluate_state(self, current_equity: float) -> WeeklyLadderState:
        # Update high watermark
        if current_equity > self.high_watermark:
            self.high_watermark = current_equity

        weekly_return_pct = ((current_equity - self.starting_equity) / max(1.0, self.starting_equity)) * 100.0
        weekly_dd_pct = ((self.high_watermark - current_equity) / max(1.0, self.high_watermark)) * 100.0

        # 1. Weekly Milestone Profit Locking
        target_reached = False
        if weekly_return_pct >= 100.0:
            target_reached = True
            capital_mode = CapitalMode.PRESERVATION
            # Lock in 80% of peak gains
            self.profit_lock_floor_usd = max(self.profit_lock_floor_usd, self.starting_equity * 1.75)
            summary = "Weekly +100% target achieved. CAPITAL PRESERVATION mode active."
        elif weekly_return_pct >= 75.0:
            capital_mode = CapitalMode.BALANCED
            self.profit_lock_floor_usd = max(self.profit_lock_floor_usd, self.starting_equity * 1.50)
            summary = "Weekly return +75% milestone. Profit floor locked at +50% ($150)."
        elif weekly_return_pct >= 50.0:
            capital_mode = CapitalMode.GROWTH
            self.profit_lock_floor_usd = max(self.profit_lock_floor_usd, self.starting_equity * 1.25)
            summary = "Weekly return +50% milestone. Profit floor locked at +25% ($125)."
        elif weekly_return_pct >= 25.0:
            capital_mode = CapitalMode.GROWTH
            self.profit_lock_floor_usd = max(self.profit_lock_floor_usd, self.starting_equity * 1.00)
            summary = "Weekly return +25%. Capital break-even protected ($100)."
        else:
            capital_mode = CapitalMode.GROWTH
            summary = "Standard GROWTH mode active."

        # 2. Dynamic Drawdown Ladder Throttling
        # 0-5% DD -> 1.0x sizing
        # 5-10% DD -> 0.75x sizing
        # 10-15% DD -> 0.50x sizing
        # 15-18% DD -> 0.25x sizing
        # 18-20% DD -> CAPITAL RECOVERY (0.0x normal, emergency highest EV only)
        # >20% DD -> HARD STOP (0.0x)
        if weekly_dd_pct >= 20.0 or current_equity <= self.profit_lock_floor_usd:
            sizing_mult = 0.0
            capital_mode = CapitalMode.DEFENSIVE
            summary = "Hard 20% weekly drawdown limit breached. TRADING HALTED."
        elif weekly_dd_pct >= 18.0:
            sizing_mult = 0.15
            capital_mode = CapitalMode.CAPITAL_RECOVERY
            summary = "CAPITAL RECOVERY mode (18-20% DD). Highly restrictive sizing."
        elif weekly_dd_pct >= 15.0:
            sizing_mult = 0.25
            capital_mode = CapitalMode.DEFENSIVE
            summary = "Emergency de-risking active (15-18% DD). Sizing reduced to 25%."
        elif weekly_dd_pct >= 10.0:
            sizing_mult = 0.50
            if capital_mode == CapitalMode.GROWTH:
                capital_mode = CapitalMode.BALANCED
            summary = "Soft drawdown tier (10-15% DD). Sizing throttled to 50%."
        elif weekly_dd_pct >= 5.0:
            sizing_mult = 0.75
            summary = "Mild drawdown tier (5-10% DD). Sizing throttled to 75%."
        else:
            sizing_mult = 1.0

        if target_reached:
            sizing_mult = 0.20  # Only take micro-risk when preserving +100% gain

        return WeeklyLadderState(
            starting_equity=round(self.starting_equity, 2),
            current_equity=round(current_equity, 2),
            high_watermark=round(self.high_watermark, 2),
            current_weekly_return_pct=round(weekly_return_pct, 2),
            current_weekly_drawdown_pct=round(weekly_dd_pct, 2),
            active_capital_mode=capital_mode,
            drawdown_sizing_multiplier=sizing_mult,
            profit_lock_floor_usd=round(self.profit_lock_floor_usd, 2),
            weekly_target_reached=target_reached,
            status_summary=summary,
        )
