import pytest

from sisera.data.models import OrderBook, OrderBookLevel
from sisera.execution.adapter import OrderRequest, PaperExecutionAdapter
from sisera.execution.intelligence import ExecutionIntelligence
from sisera.opportunity.models import Opportunity, TradeDirection


@pytest.fixture
def sample_opp():
    return Opportunity(
        opportunity_id="opp_btc_exec",
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        primary_timeframe="1h",
        entry_price=50000.0,
        invalidation_price=48500.0,
        invalidation_conditions=[],
        holding_horizon_bars=8,
        expected_value=0.08,
        p_win=0.68,
        epistemic_uncertainty=0.15,
    )


def test_paper_execution_adapter():
    adapter = PaperExecutionAdapter(initial_balance=10000.0)
    req = OrderRequest(
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        order_type="Limit",
        qty=0.1,
        price=50000.0,
        time_in_force="PostOnly",
    )
    resp = adapter.place_order(req)
    assert resp.status == "Filled"
    assert resp.filled_qty == 0.1
    assert resp.avg_fill_price == 50000.0
    assert resp.fee_paid > 0
    assert adapter.get_balance() < 10000.0


def test_execution_intelligence_order_slicing(sample_opp):
    adapter = PaperExecutionAdapter()
    exec_intel = ExecutionIntelligence(adapter, slicing_depth_ratio=0.15, max_slices=4)

    # Orderbook with $30k top 5 depth
    book = OrderBook(
        symbol="BTCUSDT",
        bids=[OrderBookLevel(price=49990.0, size=0.3)],
        asks=[OrderBookLevel(price=50010.0, size=0.3)],  # ~ $15k ask depth
        timestamp_ms=1000,
    )

    # Large order of 2 BTC ($100k) should be sliced
    large_req = OrderRequest(
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        order_type="Limit",
        qty=2.0,
        price=50000.0,
    )
    slices = exec_intel.slice_order(large_req, book)
    assert len(slices) >= 2
    assert sum(s.qty for s in slices) == pytest.approx(2.0)


def test_execution_intelligence_fallback(sample_opp):
    adapter = PaperExecutionAdapter()
    exec_intel = ExecutionIntelligence(adapter)

    book = OrderBook(
        symbol="BTCUSDT",
        bids=[OrderBookLevel(price=49990.0, size=1.0)],
        asks=[OrderBookLevel(price=50010.0, size=1.0)],
        timestamp_ms=1000,
    )
    req = OrderRequest(
        symbol="BTCUSDT",
        direction=TradeDirection.LONG,
        order_type="Limit",
        qty=0.2,
        price=50000.0,
    )
    responses = exec_intel.execute_with_fallback(req, sample_opp, book)
    assert len(responses) >= 1
    assert all(r.status == "Filled" for r in responses)
