import numpy as np
import pandas as pd

from sisera.data.models import CoinMarketData, OrderBook, OrderBookLevel, Ticker
from sisera.indicators.composite import (
    RegimeType,
    StabilityState,
    compute_liquidity_adjusted_momentum,
    compute_regime_detector,
    compute_smart_money_divergence,
    estimate_hurst_exponent,
)
from sisera.indicators.engine import IndicatorEngine, MarketSnapshot


def _generate_ohlcv(n: int = 100, trend: float = 0.0, volatility: float = 1.0) -> pd.DataFrame:
    np.random.seed(42)
    prices = [100.0]
    for _i in range(1, n):
        ret = trend + np.random.normal(0, 0.01 * volatility)
        prices.append(prices[-1] * (1 + ret))

    df = pd.DataFrame(
        {
            "open": prices,
            "high": [p * 1.01 for p in prices],
            "low": [p * 0.99 for p in prices],
            "close": prices,
            "volume": [1000.0 + i * 10 for i in range(n)],
        }
    )
    return df


def test_smart_money_divergence_accumulation():
    # Price up, funding negative, OI rising -> strong accumulation
    res = compute_smart_money_divergence(
        price_pct_change=0.05,
        funding_rate=-0.0001,
        oi_pct_change=0.10,
    )
    assert res.name == "smart_money_divergence"
    assert res.score > 0.6


def test_smart_money_divergence_crowded_squeeze():
    # Price up, funding high, short liquidations clustered -> late crowded move
    res = compute_smart_money_divergence(
        price_pct_change=0.08,
        funding_rate=0.0008,
        oi_pct_change=0.15,
        short_liq_notional=2_000_000,
        long_liq_notional=100_000,
    )
    assert res.score < 0.0


def test_liquidity_adjusted_momentum():
    raw_mom = 0.8
    # Thin order book should dampen momentum
    thin_book = OrderBook(
        symbol="XYZUSDT",
        bids=[OrderBookLevel(price=99.5, size=1.0)],
        asks=[OrderBookLevel(price=100.5, size=1.0)],
        timestamp_ms=1000,
    )
    res_thin = compute_liquidity_adjusted_momentum(
        raw_mom, order_book=thin_book, intended_notional=50_000
    )
    assert res_thin.score < raw_mom * 0.5
    assert res_thin.reliability < 0.5

    # 2. Deep book -> Full momentum passed through
    deep_book = OrderBook(
        symbol="BTCUSDT",
        bids=[OrderBookLevel(price=99.5, size=500.0)],
        asks=[OrderBookLevel(price=100.5, size=500.0)],
        timestamp_ms=1000,
    )
    res_deep = compute_liquidity_adjusted_momentum(
        raw_mom, order_book=deep_book, intended_notional=10_000
    )
    assert res_deep.score > 0.7
    assert res_deep.reliability >= 0.9


def test_estimate_hurst_exponent():
    # Pure random walk
    np.random.seed(42)
    rw = pd.Series(np.cumsum(np.random.randn(200)) + 100)
    h_rw = estimate_hurst_exponent(rw)
    assert 0.3 <= h_rw <= 0.7

    # Trending series
    trend = pd.Series(np.linspace(100, 200, 200) + np.random.randn(200) * 0.5)
    h_trend = estimate_hurst_exponent(trend)
    assert h_trend > 0.5


def test_regime_detector_trending_vs_chop():
    ohlcv_trend = _generate_ohlcv(100, trend=0.005, volatility=0.5)
    res_trend, state_trend = compute_regime_detector(ohlcv_trend)
    assert state_trend.regime_type in (RegimeType.TRENDING, RegimeType.CHOP)
    assert state_trend.stability_score > 0.0

    ohlcv_short = _generate_ohlcv(15)
    res_short, state_short = compute_regime_detector(ohlcv_short)
    assert state_short.stability == StabilityState.UNKNOWN


def test_indicator_engine_snapshot_integration():
    ohlcv = _generate_ohlcv(100)
    ticker = Ticker(
        symbol="BTCUSDT",
        last_price=50000.0,
        mark_price=50010.0,
        index_price=50000.0,
        funding_rate=0.0001,
        open_interest=10000.0,
        bid_price=49995.0,
        ask_price=50005.0,
    )
    book = OrderBook(
        symbol="BTCUSDT",
        bids=[OrderBookLevel(price=49990.0, size=5.0)],
        asks=[OrderBookLevel(price=50010.0, size=5.0)],
        timestamp_ms=1000,
    )
    market_data = CoinMarketData(
        id="bitcoin",
        symbol="btc",
        name="Bitcoin",
        market_cap=1_000_000_000_000.0,
        market_cap_rank=1,
        current_price=50000.0,
        total_volume=30_000_000_000.0,
        circulating_supply=19_000_000.0,
        max_supply=21_000_000.0,
    )

    snapshot = MarketSnapshot(
        symbol="BTCUSDT",
        timeframe="1h",
        ohlcv=ohlcv,
        ticker=ticker,
        order_book=book,
        market_data=market_data,
        dvol=55.0,
    )

    engine = IndicatorEngine()
    output = engine.compute_snapshot(snapshot)

    assert len(output.results) >= 8
    assert output.coverage_ratio > 0.5
    assert output.regime_state is not None

    names = {r.name for r in output.results}
    assert "ema_crossover" in names
    assert "rsi" in names
    assert "funding_rate" in names
    assert "order_book_imbalance" in names
    assert "market_cap_tier" in names
    assert "regime_detector" in names
    assert "smart_money_divergence" in names
