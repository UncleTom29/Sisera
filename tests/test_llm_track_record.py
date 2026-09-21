from __future__ import annotations

import pytest

from sisera.scoring.llm_track_record import LLMTrackRecord
from sisera.scoring.relevance import IndicatorRelevancePruner


@pytest.fixture
def track_record(tmp_path):
    pruner = IndicatorRelevancePruner(min_evaluations_before_prune=3)
    db_path = str(tmp_path / "llm_track_record.db")
    return LLMTrackRecord(
        db_path=db_path, relevance_pruner=pruner, resolve_after_hours=24.0,
        min_settled_for_evaluation=5,
    )


def test_record_call_stays_pending_before_resolve_time(track_record):
    called_ms = 1_000_000_000_000
    track_record.record_call(
        "BTCUSDT", "1h", "large_cap", score=0.5, confidence=0.8, reasoning="test",
        entry_price=64000.0, called_at_ms=called_ms,
    )

    assert track_record.pending_count() == 1
    assert track_record.settled_count() == 0

    # Not yet due (only 1 hour later, resolve_after_hours=24)
    settled = track_record.settle_due(
        price_lookup=lambda s: 65000.0, now_ms=called_ms + 3600 * 1000
    )
    assert settled == 0
    assert track_record.pending_count() == 1


def test_settle_due_computes_forward_return_and_moves_to_settled(track_record):
    called_ms = 1_000_000_000_000
    track_record.record_call(
        "BTCUSDT", "1h", "large_cap", score=0.5, confidence=0.8, reasoning="test",
        entry_price=64000.0, called_at_ms=called_ms,
    )

    resolve_ms = called_ms + 25 * 3600 * 1000  # past the 24h resolve window
    settled = track_record.settle_due(price_lookup=lambda s: 70400.0, now_ms=resolve_ms)  # +10%

    assert settled == 1
    assert track_record.pending_count() == 0
    assert track_record.settled_count() == 1

    calls = track_record.recent_settled()
    assert len(calls) == 1
    assert calls[0].forward_return == pytest.approx(0.10, abs=1e-6)


def test_settle_due_skips_symbols_price_lookup_cannot_resolve(track_record):
    called_ms = 1_000_000_000_000
    track_record.record_call(
        "DELISTEDUSDT", "1h", "large_cap", score=0.5, confidence=0.8, reasoning="test",
        entry_price=1.0, called_at_ms=called_ms,
    )

    resolve_ms = called_ms + 25 * 3600 * 1000
    settled = track_record.settle_due(price_lookup=lambda s: None, now_ms=resolve_ms)

    assert settled == 0
    assert track_record.pending_count() == 1  # stays pending, not silently dropped


def test_settle_due_feeds_relevance_pruner_once_enough_settled(track_record):
    called_ms = 1_000_000_000_000
    resolve_ms = called_ms + 25 * 3600 * 1000

    # Scores that vary from strongly bearish to strongly bullish, with realized forward
    # returns that agree with each call's direction -- a clean, strongly positive IC the
    # relevance pruner should register.
    scores = [-0.8, -0.4, 0.0, 0.4, 0.8]
    exit_prices = {f"SYM{i}USDT": 100.0 * (1.0 + scores[i] * 0.1) for i in range(5)}
    for i, score in enumerate(scores):
        track_record.record_call(
            f"SYM{i}USDT", "1h", "large_cap", score=score, confidence=0.9, reasoning="test",
            entry_price=100.0, called_at_ms=called_ms,
        )
    track_record.settle_due(price_lookup=lambda s: exit_prices[s], now_ms=resolve_ms)

    key = ("1h", "large_cap", "llm_fundamental_analysis")
    assert key in track_record.relevance_pruner._records
    record = track_record.relevance_pruner._records[key]
    assert len(record.marginal_contribution_history) == 1
    assert record.marginal_contribution_history[0] > 0.9  # near-perfect linear agreement


def test_settle_due_does_not_record_relevance_below_minimum_sample(track_record):
    called_ms = 1_000_000_000_000
    resolve_ms = called_ms + 25 * 3600 * 1000

    # Only 3 settled calls, below min_settled_for_evaluation=5
    for i in range(3):
        track_record.record_call(
            f"SYM{i}USDT", "1h", "large_cap", score=0.5, confidence=0.5, reasoning="x",
            entry_price=100.0, called_at_ms=called_ms,
        )
    track_record.settle_due(price_lookup=lambda s: 105.0, now_ms=resolve_ms)

    key = ("1h", "large_cap", "llm_fundamental_analysis")
    assert key not in track_record.relevance_pruner._records


class TestMultipleIndicatorsDoNotCollide:
    """Regression test for a real bug caught before it shipped: LLMTrackRecord used to
    hardcode indicator_name="llm_fundamental_analysis" internally, so reusing it for
    news_sentiment tracking would have misattributed news accuracy to the fundamental
    indicator's relevance record."""

    def test_separate_instances_report_under_their_own_indicator_name(self, tmp_path):
        pruner = IndicatorRelevancePruner(min_evaluations_before_prune=3)
        db_path = str(tmp_path / "shared.db")  # same db file, different tables
        fundamental_tracker = LLMTrackRecord(
            db_path=db_path, relevance_pruner=pruner, indicator_name="llm_fundamental_analysis",
            resolve_after_hours=24.0, min_settled_for_evaluation=1,
        )
        news_tracker = LLMTrackRecord(
            db_path=db_path, relevance_pruner=pruner, indicator_name="news_sentiment",
            resolve_after_hours=1.0, min_settled_for_evaluation=1,
        )

        called_ms = 1_000_000_000_000
        fundamental_tracker.record_call(
            "BTCUSDT", "1h", "large_cap", score=0.5, confidence=0.8, reasoning="fundamental",
            entry_price=100.0, called_at_ms=called_ms,
        )
        news_tracker.record_call(
            "BTCUSDT", "1h", "large_cap", score=-0.5, confidence=0.8, reasoning="news",
            entry_price=100.0, called_at_ms=called_ms,
        )

        resolve_ms = called_ms + 25 * 3600 * 1000
        fundamental_tracker.settle_due(price_lookup=lambda s: 110.0, now_ms=resolve_ms)
        news_tracker.settle_due(price_lookup=lambda s: 90.0, now_ms=resolve_ms)

        # Each call landed in its own table -- neither tracker sees the other's pending call
        assert fundamental_tracker.settled_count() == 1
        assert news_tracker.settled_count() == 1

        # Each reported to the pruner under its own name, not the other's
        fundamental_key = ("1h", "large_cap", "llm_fundamental_analysis")
        news_key = ("1h", "large_cap", "news_sentiment")
        assert fundamental_key in pruner._records
        assert news_key in pruner._records
        assert pruner._records[fundamental_key].marginal_contribution_history != []
        assert pruner._records[news_key].marginal_contribution_history != []
