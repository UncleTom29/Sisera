from __future__ import annotations

from sisera.data.x_spend_tracker import XSpendTracker

_DAY_MS = 86_400_000
_DAY1_MS = 1_800_000_000_000  # an arbitrary fixed UTC day for determinism


def _tracker(tmp_path, max_daily_spend_usd: float = 1.0) -> XSpendTracker:
    return XSpendTracker(db_path=str(tmp_path / "x_spend.db"), max_daily_spend_usd=max_daily_spend_usd)


def test_fresh_tracker_has_zero_spend_and_full_budget(tmp_path):
    tracker = _tracker(tmp_path, max_daily_spend_usd=2.0)
    assert tracker.today_spend_usd(_DAY1_MS) == 0.0
    assert tracker.remaining_budget_usd(_DAY1_MS) == 2.0
    # 100 reads * $0.005/read (config default) = $0.50, comfortably under the $2.00 cap.
    assert tracker.would_exceed(estimated_reads=100, now_ms=_DAY1_MS) is False


def test_record_reads_accumulates_spend(tmp_path):
    tracker = _tracker(tmp_path)
    tracker.record_reads(10, now_ms=_DAY1_MS)  # 10 * $0.005 = $0.05
    tracker.record_reads(10, now_ms=_DAY1_MS)  # another $0.05 -> $0.10 cumulative

    assert tracker.today_spend_usd(_DAY1_MS) == 0.10


def test_would_exceed_blocks_once_cap_would_be_crossed(tmp_path):
    tracker = _tracker(tmp_path, max_daily_spend_usd=0.05)  # 10 reads worth
    tracker.record_reads(10, now_ms=_DAY1_MS)  # exactly at cap

    assert tracker.would_exceed(estimated_reads=1, now_ms=_DAY1_MS) is True
    assert tracker.remaining_budget_usd(_DAY1_MS) == 0.0


def test_would_exceed_false_when_comfortably_under_cap(tmp_path):
    tracker = _tracker(tmp_path, max_daily_spend_usd=10.0)
    tracker.record_reads(10, now_ms=_DAY1_MS)  # $0.05 spent

    assert tracker.would_exceed(estimated_reads=25, now_ms=_DAY1_MS) is False


def test_spend_resets_on_utc_day_rollover(tmp_path):
    tracker = _tracker(tmp_path, max_daily_spend_usd=0.05)
    tracker.record_reads(10, now_ms=_DAY1_MS)  # exhausts day 1's cap
    assert tracker.would_exceed(estimated_reads=1, now_ms=_DAY1_MS) is True

    next_day_ms = _DAY1_MS + _DAY_MS
    assert tracker.today_spend_usd(next_day_ms) == 0.0
    assert tracker.would_exceed(estimated_reads=1, now_ms=next_day_ms) is False
