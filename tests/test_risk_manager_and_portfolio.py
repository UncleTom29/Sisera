import pytest

from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.risk.manager import RiskManager
from sisera.risk.models import PortfolioState, Position


@pytest.fixture
def sample_opp():
    return Opportunity(
        opportunity_id="opp_btc_1",
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        primary_timeframe="1h",
        entry_price=50000.0,
        invalidation_price=48500.0,
        invalidation_conditions=[],
        holding_horizon_bars=12,
        expected_value=0.08,
        p_win=0.68,
        epistemic_uncertainty=0.15,
        execution_quality=0.85,
        crowding_level=0.20,
        data_confidence=0.90,
    )


def test_position_sizing_and_liquidation_buffer(sample_opp):
    rm = RiskManager(max_leverage=5.0, kelly_multiplier=0.5, max_pos_notional_pct=0.20)
    portfolio = PortfolioState(cash_balance=10000.0, equity=10000.0, peak_equity=10000.0)

    sizing = rm.size_position(sample_opp, portfolio, atr_value=1000.0, cluster="large_cap")

    assert sizing.notional_size > 500.0
    assert sizing.notional_size <= 2000.0  # max 20%
    # large_cap (BTC/ETH) gets a materially higher ceiling than self.max_leverage --
    # 1.5x it -- since it's confidence-scaled now, not a flat per-cluster lookup.
    assert sizing.leverage <= 5.0 * 1.5
    assert sizing.margin_required > 0
    assert sizing.liquidation_price < sizing.initial_stop_price  # Liquidation is below stop
    assert sizing.passed_liquidation_stress_check is True


def test_leverage_scales_with_conviction(sample_opp):
    """Leverage was previously a flat per-cluster lookup regardless of signal strength.
    Now a higher-p_win opportunity should get more leverage than a lower-p_win one in the
    same cluster, bounded by [base_leverage, cluster_ceiling] -- where cluster_ceiling is
    itself derived from what the liquidation stress test can actually pass for this
    cluster (mid_cap: cascade 8% * 1.5 stress multiplier + 1% maintenance margin -> ~7.7x
    theoretical max, *0.85 safety margin -> ~6.5x), not an independent, disconnected
    number. A ceiling above what the stress test can pass would be unusable headroom, not
    real capacity -- confirmed live against a real candidate that failed the stress test
    at a much lower leverage than the old flat ceiling implied was available."""
    rm = RiskManager(max_leverage=20.0)
    portfolio = PortfolioState(cash_balance=10000.0, equity=10000.0, peak_equity=10000.0)

    weak_opp = sample_opp.model_copy(update={"p_win": 0.51})
    strong_opp = sample_opp.model_copy(update={"p_win": 0.95})

    weak_sizing = rm.size_position(weak_opp, portfolio, atr_value=1000.0, cluster="mid_cap")
    strong_sizing = rm.size_position(strong_opp, portfolio, atr_value=1000.0, cluster="mid_cap")

    assert weak_sizing.leverage < strong_sizing.leverage
    assert weak_sizing.leverage >= 3.0 * 0.9  # near the base floor for a barely-qualifying trade
    assert strong_sizing.leverage < 7.7  # below the theoretical stress-test-passable max
    assert strong_sizing.leverage > 5.5  # meaningfully above the base floor at near-max conviction
    # The whole point: leverage this formula produces must actually be usable.
    assert strong_sizing.passed_liquidation_stress_check is True


def test_large_cap_gets_higher_leverage_ceiling_than_mid_cap(sample_opp):
    rm = RiskManager(max_leverage=20.0)
    portfolio = PortfolioState(cash_balance=10000.0, equity=10000.0, peak_equity=10000.0)
    high_conviction = sample_opp.model_copy(update={"p_win": 0.90})

    large_cap_sizing = rm.size_position(high_conviction, portfolio, atr_value=1000.0, cluster="large_cap")
    mid_cap_sizing = rm.size_position(high_conviction, portfolio, atr_value=1000.0, cluster="mid_cap")

    assert large_cap_sizing.leverage > mid_cap_sizing.leverage
    assert large_cap_sizing.leverage <= 20.0 * 1.5


def test_trailing_stop_calculation(sample_opp):
    rm = RiskManager()
    pos = Position(
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        entry_price=50000.0,
        size_notional=2000.0,
        leverage=3.0,
        margin=666.67,
        liquidation_price=34000.0,
        stop_loss_price=47500.0,
        highest_price=50000.0,
    )

    # Price hasn't reached activation threshold (+1% = 50500)
    stop_unchanged = rm.calculate_trailing_stop(pos, current_price=50200.0, atr_value=1000.0)
    assert stop_unchanged is None or stop_unchanged == 47500.0

    # Price surges to 55000 (+10%)
    stop_trailed = rm.calculate_trailing_stop(pos, current_price=55000.0, atr_value=1000.0)
    assert stop_trailed is not None
    assert stop_trailed > 50000.0  # Stop locked into profit!


def test_circuit_breakers():
    rm = RiskManager(max_drawdown_pct=0.15, max_margin_ratio=0.70, max_daily_trades=10)

    # Normal state
    p_ok = PortfolioState(equity=10000.0, peak_equity=10000.0)
    passed, reasons = rm.check_circuit_breakers(p_ok)
    assert passed is True

    # Drawdown breached
    p_dd = PortfolioState(equity=8000.0, peak_equity=10000.0)  # 20% DD
    passed_dd, reasons_dd = rm.check_circuit_breakers(p_dd)
    assert passed_dd is False
    assert any("drawdown" in r.lower() for r in reasons_dd)


def test_portfolio_scenario_stress_test(sample_opp):
    rm = RiskManager()
    portfolio = PortfolioState(
        cash_balance=10000.0,
        equity=10000.0,
        peak_equity=10000.0,
        open_positions={
            "ETHUSDT": Position(
                symbol="ETHUSDT",
                direction=TradeDirection.LONG,
                entry_price=3000.0,
                size_notional=2500.0,
                leverage=3.0,
                margin=833.33,
                liquidation_price=2050.0,
                stop_loss_price=2850.0,
                beta_to_btc=1.3,
            )
        },
    )

    sizing = rm.size_position(sample_opp, portfolio, atr_value=1000.0)
    stress_res = rm.stress_test_portfolio(sample_opp, sizing, portfolio, btc_shock_pct=-0.06)

    assert stress_res.passed is True
    assert stress_res.projected_equity > 8000.0
    assert stress_res.simulated_margin_ratio < 0.85
