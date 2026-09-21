"""Portfolio and Risk models. See SCOPE.md §9.

Covers derivatives-native risk state: isolated margin, scenario-based liquidation buffers,
trailing stops, factor exposures, and portfolio circuit breakers.
"""

from __future__ import annotations

import time

from pydantic import BaseModel, Field

from sisera.opportunity.models import TradeDirection


class Position(BaseModel):
    """An open perpetual contract position."""

    symbol: str
    direction: TradeDirection
    entry_price: float
    size_notional: float
    leverage: float
    margin: float
    liquidation_price: float
    stop_loss_price: float
    trailing_stop_price: float | None = None
    highest_price: float = 0.0  # For LONG trailing
    lowest_price: float = 0.0  # For SHORT trailing
    unrealized_pnl: float = 0.0
    accumulated_funding: float = 0.0
    open_timestamp_ms: int = Field(default_factory=lambda: int(time.time() * 1000))
    opportunity_id: str = ""
    cluster: str = "large_cap"
    beta_to_btc: float = 1.0
    # Open interest at entry time -- lets PositionIntelligenceEngine compute a real OI
    # Reversal invalidation trigger (vs. current OI) instead of a hardcoded placeholder.
    # 0.0 for positions opened before this field existed; treated as "not tracked" there.
    entry_open_interest: float = 0.0


class PortfolioState(BaseModel):
    """Real-time portfolio state."""

    cash_balance: float = 10_000.0
    equity: float = 10_000.0
    peak_equity: float = 10_000.0
    open_positions: dict[str, Position] = Field(default_factory=dict)
    daily_trades_count: int = 0
    last_trade_date: str = ""

    @property
    def margin_used(self) -> float:
        return sum(p.margin for p in list(self.open_positions.values()))

    @property
    def margin_ratio(self) -> float:
        return self.margin_used / max(self.equity, 1.0)

    @property
    def current_drawdown_pct(self) -> float:
        if self.peak_equity <= 0:
            return 0.0
        return max(0.0, (self.peak_equity - self.equity) / self.peak_equity)

    @property
    def total_notional_exposure(self) -> float:
        return sum(p.size_notional for p in list(self.open_positions.values()))


class PositionSizingResult(BaseModel):
    """Output of position sizing and leverage determination."""

    notional_size: float
    leverage: float
    margin_required: float
    initial_stop_price: float
    liquidation_price: float
    liquidation_buffer_pct: float
    passed_liquidation_stress_check: bool
    rejection_reasons: list[str] = Field(default_factory=list)


class StressTestResult(BaseModel):
    """Output of pre-trade portfolio scenario stress test."""

    passed: bool
    simulated_margin_ratio: float
    projected_equity: float
    breach_reasons: list[str] = Field(default_factory=list)
