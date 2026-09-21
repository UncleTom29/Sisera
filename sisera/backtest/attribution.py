"""Trade Attribution & "Why not?" Attribution Engine. See SCOPE.md §10.

Decomposes realized trade P&L into:
- Signal attribution
- Regime attribution
- Entry timing attribution
- Execution slippage
- Exit attribution
- Funding cost
And aggregates "Why not?" attribution across WAIT / NO_TRADE decisions.
"""

from __future__ import annotations

from pydantic import BaseModel

from sisera.ledger.models import DecisionLedgerEntry
from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.risk.models import Position


class TradeAttribution(BaseModel):
    """Post-hoc decomposition of realized trade P&L. See SCOPE.md §10."""

    trade_id: str
    symbol: str
    direction: TradeDirection
    timeframe: str = ""
    total_pnl: float
    total_pnl_pct: float
    pnl_r_multiple: float = 0.0  # net PnL relative to the entry-to-stop risk unit
    signal_attribution: float
    regime_attribution: float
    timing_attribution: float
    slippage_cost: float
    exit_attribution: float
    funding_cost: float


class WhyNotAttribution(BaseModel):
    """Aggregate statistics explaining why opportunities did not trade. See SCOPE.md §10."""

    total_decisions: int
    total_trades: int
    total_waits: int
    total_no_trades: int
    reason_code_counts: dict[str, int]
    reason_code_percentages: dict[str, float]


class TradeAttributionEngine:
    """Computes trade P&L attribution and 'Why not' attribution for abstentions."""

    def attribute_trade(
        self,
        trade_id: str,
        position: Position,
        opportunity: Opportunity,
        exit_price: float,
        expected_fill_price: float | None = None,
        slippage_paid: float = 0.0,
    ) -> TradeAttribution:
        entry_p = position.entry_price
        notional = position.size_notional

        # Raw price delta
        if position.direction == TradeDirection.LONG:
            price_return = (exit_price - entry_p) / entry_p
        else:
            price_return = (entry_p - exit_price) / entry_p

        gross_pnl = notional * price_return
        funding = position.accumulated_funding
        net_pnl = gross_pnl - funding - slippage_paid

        # Attribution decomposition (§10)
        # 1. Signal Attribution: expected signal portion
        signal_strength = max(-1.0, min(1.0, (opportunity.p_win - 0.5) * 2.0))
        signal_pnl = gross_pnl * max(0.2, abs(signal_strength))

        # 2. Regime Attribution
        regime_pnl = gross_pnl * (opportunity.regime_stability - 0.5) * 0.3

        # 3. Timing / Slippage
        timing_pnl = -slippage_paid

        # 4. Exit Attribution (value captured by stop logic)
        exit_pnl = gross_pnl - signal_pnl - regime_pnl

        # R-multiple: net PnL against the actual risk unit this trade was sized to (the
        # entry-to-stop distance), not just raw % of notional -- this is what lets
        # OpportunityEngine compute real avg_win_r/avg_loss_r from settled trade history
        # instead of a static per-timeframe lookup table.
        stop_dist_pct = abs(entry_p - position.stop_loss_price) / entry_p if entry_p > 0 else 0.0
        pnl_r_multiple = (net_pnl / notional) / stop_dist_pct if notional > 0 and stop_dist_pct > 1e-9 else 0.0

        return TradeAttribution(
            trade_id=trade_id,
            symbol=position.symbol,
            direction=position.direction,
            timeframe=opportunity.primary_timeframe,
            total_pnl=net_pnl,
            total_pnl_pct=net_pnl / notional if notional > 0 else 0.0,
            pnl_r_multiple=round(pnl_r_multiple, 3),
            signal_attribution=signal_pnl,
            regime_attribution=regime_pnl,
            timing_attribution=timing_pnl,
            slippage_cost=slippage_paid,
            exit_attribution=exit_pnl,
            funding_cost=funding,
        )

    def aggregate_why_not(self, ledger_entries: list[DecisionLedgerEntry]) -> WhyNotAttribution:
        """Aggregates reason codes across all decisions for 'Why not?' attribution (§10)."""
        counts: dict[str, int] = {}
        total_trades = 0
        total_waits = 0
        total_no_trades = 0

        for entry in ledger_entries:
            dec = entry.decision.upper()
            if dec == "TRADE":
                total_trades += 1
            elif dec == "WAIT":
                total_waits += 1
            elif dec == "NO_TRADE":
                total_no_trades += 1

            for code in entry.reason_codes:
                counts[code] = counts.get(code, 0) + 1

        total_reasons = sum(counts.values()) or 1
        percentages = {code: count / total_reasons for code, count in counts.items()}

        return WhyNotAttribution(
            total_decisions=len(ledger_entries),
            total_trades=total_trades,
            total_waits=total_waits,
            total_no_trades=total_no_trades,
            reason_code_counts=counts,
            reason_code_percentages=percentages,
        )
