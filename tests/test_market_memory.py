import numpy as np

from sisera.memory.engine import MarketMemory
from sisera.memory.models import MarketStateSnapshot


def test_market_memory_analog_retrieval():
    mem = MarketMemory(k_neighbors=3, min_history_threshold=5)

    # Empty memory queries gracefully degrade
    empty_res = mem.query_analogs(np.array([0.5, 0.5, 0.5]))
    assert empty_res.has_analogs is False
    assert empty_res.continuation_rate == 0.50

    # Populate 10 historical snapshots
    for i in range(10):
        vec = [0.1 * i, 0.2, 0.3]
        fwd_ret = 0.05 if i % 2 == 0 else -0.02
        mem.record_state(
            MarketStateSnapshot(
                snapshot_id=f"snap_{i}",
                symbol="BTCUSDT",
                timeframe="1h",
                feature_vector=vec,
                forward_return=fwd_ret,
                forward_mae=0.015,
                best_profile_timeframe="1h",
            )
        )

    # Query with vector close to snap_0 ([0.0, 0.2, 0.3])
    res = mem.query_analogs([0.02, 0.2, 0.3])
    assert res.has_analogs is True
    assert res.matched_count == 3
    assert len(res.matches) == 3
    assert res.matches[0].snapshot.snapshot_id == "snap_0"
