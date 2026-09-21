"""Unit tests for the Weekly Profit-Locking & Dynamic Drawdown Ladder Engine."""

from __future__ import annotations

import pytest

from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.risk.manager import RiskManager
from sisera.risk.models import PortfolioState, Position
from sisera.risk.profit_lock import CapitalMode, ProfitLockEngine


def test_drawdown_ladder_throttling():
    engine = ProfitLockEngine(weekly_start_capital=100.0)

    # 1. Start state: $100 -> 0% DD -> Sizing 1.0x, GROWTH mode
    s0 = engine.evaluate_state(100.0)
    assert s0.current_weekly_drawdown_pct == 0.0
    assert s0.drawdown_sizing_multiplier == 1.0
    assert s0.active_capital_mode == CapitalMode.GROWTH

    # 2. Equity drops to $94 (6% DD) -> Sizing throttles to 0.75x
    s1 = engine.evaluate_state(94.0)
    assert s1.current_weekly_drawdown_pct == 6.0
    assert s1.drawdown_sizing_multiplier == 0.75

    # 3. Equity drops to $88 (12% DD) -> Sizing throttles to 0.50x
    s2 = engine.evaluate_state(88.0)
    assert s2.current_weekly_drawdown_pct == 12.0
    assert s2.drawdown_sizing_multiplier == 0.50

    # 4. Equity drops to $84 (16% DD) -> Sizing throttles to 0.25x
    s3 = engine.evaluate_state(84.0)
    assert s3.current_weekly_drawdown_pct == 16.0
    assert s3.drawdown_sizing_multiplier == 0.25

    # 5. Equity drops to $81 (19% DD) -> CAPITAL RECOVERY mode
    s4 = engine.evaluate_state(81.0)
    assert s4.current_weekly_drawdown_pct == 19.0
    assert s4.active_capital_mode == CapitalMode.CAPITAL_RECOVERY
    assert s4.drawdown_sizing_multiplier == 0.15

    # 6. Equity drops to $79 (21% DD) -> Hard stop (0.0x)
    s5 = engine.evaluate_state(79.0)
    assert s5.drawdown_sizing_multiplier == 0.0


def test_milestone_profit_locking():
    engine = ProfitLockEngine(weekly_start_capital=100.0)

    # Grow to $150 (+50%)
    s_50 = engine.evaluate_state(150.0)
    assert s_50.current_weekly_return_pct == 50.0
    assert s_50.profit_lock_floor_usd == 125.0

    # Grow to $175 (+75%)
    s_75 = engine.evaluate_state(175.0)
    assert s_75.current_weekly_return_pct == 75.0
    assert s_75.profit_lock_floor_usd == 150.0

    # Grow to $200 (+100% target)
    s_100 = engine.evaluate_state(200.0)
    assert s_100.current_weekly_return_pct == 100.0
    assert s_100.weekly_target_reached is True
    assert s_100.active_capital_mode == CapitalMode.PRESERVATION


def test_position_capacity_no_longer_specially_restricted_below_250_equity():
    """Regression test: previously, ANY account under $250 equity was hard-capped at 2
    full-size positions regardless of top_n_size, so a 3rd qualifying candidate got
    rejected even with correlation-cluster and total-notional headroom to spare. Removed
    at explicit user request -- position count is now governed uniformly by
    top_n_portfolio_size for every account size, same as any other. Uses a larger notional
    budget than the old test so total-notional-exposure isn't a confound: this test is
    specifically about the position-COUNT gate, not the notional-size gate."""
    rm = RiskManager(top_n_size=8)

    port_small = PortfolioState(cash_balance=100.0, equity=100.0, peak_equity=100.0)
    port_small.open_positions["BTCUSDT"] = Position(
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        size_notional=10.0,
        margin=3.0,
        leverage=3.0,
        entry_price=64000.0,
        liquidation_price=45000.0,
        stop_loss_price=62000.0,
    )
    port_small.open_positions["ETHUSDT"] = Position(
        symbol="ETHUSDT",
        direction=TradeDirection.LONG,
        size_notional=10.0,
        margin=3.0,
        leverage=3.0,
        entry_price=3000.0,
        liquidation_price=2100.0,
        stop_loss_price=2900.0,
    )

    opp = Opportunity(
        opportunity_id="opp_SOL_1",
        symbol="SOLUSDT",
        direction=TradeDirection.LONG,
        primary_timeframe="15m",
        entry_price=140.0,
        stop_loss_price=137.0,
        invalidation_price=137.0,
        invalidation_conditions=[],
        holding_horizon_bars=12,
        expected_value=0.85,
        p_win=0.62,
        epistemic_uncertainty=0.15,
        execution_quality=0.85,
        regime_stability=0.80,
    )

    res = rm.size_position(opp, port_small)
    assert not any("Max concurrent positions" in r for r in res.rejection_reasons)


def test_position_capacity_still_capped_at_top_n_size():
    """The position-count gate isn't gone, just unified and raised -- confirms it still
    rejects once top_n_size is actually reached, on any account size."""
    rm = RiskManager(top_n_size=2)
    portfolio = PortfolioState(cash_balance=10_000.0, equity=10_000.0, peak_equity=10_000.0)
    for i in range(2):
        portfolio.open_positions[f"SYM{i}USDT"] = Position(
            symbol=f"SYM{i}USDT", direction=TradeDirection.LONG, size_notional=50.0,
            margin=15.0, leverage=3.0, entry_price=100.0, liquidation_price=70.0,
            stop_loss_price=95.0,
        )

    opp = Opportunity(
        opportunity_id="opp_SOL_1", symbol="SOLUSDT", direction=TradeDirection.LONG,
        primary_timeframe="15m", entry_price=140.0, stop_loss_price=137.0,
        invalidation_price=137.0, invalidation_conditions=[], holding_horizon_bars=12,
        expected_value=0.85, p_win=0.62, epistemic_uncertainty=0.15, execution_quality=0.85,
        regime_stability=0.80,
    )

    res = rm.size_position(opp, portfolio)
    assert any("Max concurrent positions reached" in r for r in res.rejection_reasons)
