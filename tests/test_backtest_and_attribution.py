import numpy as np
import pandas as pd
import pytest

from sisera.backtest.attribution import TradeAttributionEngine
from sisera.backtest.engine import (
    BacktestEngine,
    calculate_cvar,
    calculate_deflated_sharpe_ratio,
)
from sisera.opportunity.models import Opportunity, TradeDirection
from sisera.risk.models import Position


def _generate_ohlcv(n: int = 150) -> pd.DataFrame:
    np.random.seed(42)
    prices = [50000.0]
    for _i in range(1, n):
        # Trending upward with realistic volatility
        ret = 0.002 + np.random.normal(0, 0.015)
        prices.append(prices[-1] * (1 + ret))

    df = pd.DataFrame(
        {
            "open": prices,
            "high": [p * 1.01 for p in prices],
            "low": [p * 0.99 for p in prices],
            "close": prices,
            "volume": [1000.0 + i * 5 for i in range(n)],
        }
    )
    return df


def test_deflated_sharpe_ratio():
    np.random.seed(42)
    # Strong consistent positive returns
    good_returns = np.random.normal(0.01, 0.02, 100)
    dsr_good = calculate_deflated_sharpe_ratio(good_returns, num_trials=10)
    assert dsr_good > 0.60

    # Noisy / zero-mean returns tested across many trials (heavy multiple-comparison penalty)
    noise_returns = np.random.normal(0.0, 0.02, 50)
    dsr_noise = calculate_deflated_sharpe_ratio(noise_returns, num_trials=100)
    assert dsr_noise < 0.50


def test_cvar_tail_loss():
    returns = np.array([-0.10, -0.05, -0.02, 0.01, 0.02, 0.05, 0.08])
    cvar = calculate_cvar(returns, alpha=0.15)
    assert cvar < 0.0
    assert cvar <= -0.05


def test_backtest_engine_run_timeframe():
    df = _generate_ohlcv(120)
    engine = BacktestEngine()

    result = engine.run_timeframe_backtest(
        symbol="BTCUSDT",
        timeframe="1h",
        ohlcv_df=df,
        initial_capital=10_000.0,
    )

    assert result.timeframe == "1h"
    assert len(result.equity_curve) > 50
    assert isinstance(result.win_rate, float)
    assert isinstance(result.expected_value, float)
    assert isinstance(result.passed_gating, bool)
    assert isinstance(result.deflated_sharpe_ratio, float)


def test_trade_attribution_records_real_timeframe_and_r_multiple():
    """Regression test: TradeAttribution previously had no timeframe field and no
    R-multiple, so OpportunityEngine.package()'s avg_win_r/avg_loss_r had no real settled
    trade history to compute from at all."""
    pos = Position(
        symbol="BTCUSDT", direction=TradeDirection.LONG, entry_price=100.0,
        size_notional=1000.0, leverage=3.0, margin=333.0, liquidation_price=70.0,
        stop_loss_price=95.0,  # 5% stop distance -> risk unit
    )
    opp = Opportunity(
        opportunity_id="opp1", symbol="BTCUSDT", direction=TradeDirection.LONG,
        primary_timeframe="4h", entry_price=100.0, invalidation_price=95.0,
        invalidation_conditions=[], holding_horizon_bars=12, expected_value=0.05, p_win=0.6,
        epistemic_uncertainty=0.15,
    )
    engine = TradeAttributionEngine()

    # Exited at +10% (2x the 5% risk unit) -> should be close to a +2.0R multiple.
    attribution = engine.attribute_trade("t1", pos, opp, exit_price=110.0)

    assert attribution.timeframe == "4h"
    assert attribution.pnl_r_multiple == pytest.approx(2.0, abs=0.05)
