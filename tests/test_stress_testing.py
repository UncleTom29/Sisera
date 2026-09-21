import pytest
from sisera.opportunity.models import TradeDirection
from sisera.risk.models import PortfolioState, Position
from sisera.risk.stress_testing import PortfolioStressEngine


@pytest.fixture
def sample_portfolio():
    p = PortfolioState(equity=10000.0, cash_balance=8500.0)
    p.open_positions["BTCUSDT"] = Position(
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        entry_price=60000.0,
        size_notional=3000.0,
        leverage=3.0,
        margin=1000.0,
        liquidation_price=45000.0,
        stop_loss_price=58000.0,
    )
    p.open_positions["ETHUSDT"] = Position(
        symbol="ETHUSDT",
        direction=TradeDirection.LONG,
        entry_price=3000.0,
        size_notional=1500.0,
        leverage=3.0,
        margin=500.0,
        liquidation_price=2200.0,
        stop_loss_price=2850.0,
    )
    return p


def test_portfolio_stress_engine_exposures(sample_portfolio):
    engine = PortfolioStressEngine()
    exp = engine.compute_exposures(sample_portfolio)

    assert exp.total_long_notional == 4500.0
    assert exp.total_short_notional == 0.0
    assert exp.net_notional_delta == 4500.0
    assert exp.btc_beta_exposure > 0.0
    assert exp.total_portfolio_risk_r > 0.0
    assert exp.expected_portfolio_ev_r > 0.0


def test_portfolio_stress_engine_risk_radar(sample_portfolio):
    engine = PortfolioStressEngine()
    radar = engine.compute_risk_radar(sample_portfolio)

    assert 0 <= radar.overall_health_score <= 100
    assert radar.liquidation_risk_score > 0.0
    assert len(radar.risk_summary_note) > 10


def test_portfolio_stress_engine_shock_scenarios(sample_portfolio):
    engine = PortfolioStressEngine()

    res_btc = engine.simulate_scenario(sample_portfolio, "BTC_CRASH_5PCT")
    assert res_btc.simulated_pnl_usd < 0  # Long positions lose under drop
    assert res_btc.simulated_equity_usd < 10000.0
    assert res_btc.worst_affected_symbol in ["BTCUSDT", "ETHUSDT"]

    res_vol = engine.simulate_scenario(sample_portfolio, "VOLATILITY_EXPLOSION")
    assert res_vol.simulated_pnl_usd < 0
    assert "leverage" in res_vol.remedy_action.lower()


def test_worst_affected_symbol_is_real_for_volatility_and_liquidity_scenarios(sample_portfolio):
    """Regression test: these two scenarios previously hardcoded worst_affected_symbol to
    "LINKUSDT"/"AVAXUSDT" regardless of actual holdings (sample_portfolio here only ever
    holds BTCUSDT/ETHUSDT, so either hardcoded value would be wrong)."""
    engine = PortfolioStressEngine()

    res_vol = engine.simulate_scenario(sample_portfolio, "VOLATILITY_EXPANSION_30PCT")
    assert res_vol.worst_affected_symbol in ("BTCUSDT", "ETHUSDT")
    # BTCUSDT has the larger notional (3000 vs 1500) -> larger real impact -> worst hit.
    assert res_vol.worst_affected_symbol == "BTCUSDT"

    res_liq = engine.simulate_scenario(sample_portfolio, "LIQUIDITY_EVAPORATION_50PCT")
    assert res_liq.worst_affected_symbol == "BTCUSDT"


def test_worst_affected_symbol_is_none_with_no_open_positions():
    engine = PortfolioStressEngine()
    empty_portfolio = PortfolioState(equity=10000.0, cash_balance=10000.0)

    res = engine.simulate_scenario(empty_portfolio, "VOLATILITY_EXPANSION_30PCT")
    assert res.worst_affected_symbol == "NONE"
