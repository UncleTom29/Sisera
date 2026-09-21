from __future__ import annotations

from sisera.scoring.event_attribution import EventAttributionEngine, source_key


def _engine(tmp_path, **kwargs) -> EventAttributionEngine:
    db_path = str(tmp_path / "event_attribution.db")
    defaults = dict(resolve_after_hours=24.0, min_settled_for_score=5, rolling_window=30)
    defaults.update(kwargs)
    return EventAttributionEngine(db_path=db_path, **defaults)


def test_source_key_keeps_same_name_distinct_across_source_types():
    assert source_key("rss", "cointelegraph") != source_key("telegram", "cointelegraph")


def test_call_stays_pending_before_resolve_time(tmp_path):
    engine = _engine(tmp_path)
    called_ms = 1_000_000_000_000
    engine.record_call(
        "rss", "coindesk", "BTCUSDT", "macro_fed", 3, score=0.5, confidence=0.8,
        entry_price=64000.0, called_at_ms=called_ms,
    )

    settled = engine.settle_due(price_lookup=lambda s: 65000.0, now_ms=called_ms + 3600 * 1000)
    assert settled == 0


def test_settle_due_computes_forward_return(tmp_path):
    engine = _engine(tmp_path)
    called_ms = 1_000_000_000_000
    engine.record_call(
        "rss", "coindesk", "BTCUSDT", "macro_fed", 3, score=0.5, confidence=0.8,
        entry_price=64000.0, called_at_ms=called_ms,
    )

    resolve_ms = called_ms + 25 * 3600 * 1000
    settled = engine.settle_due(price_lookup=lambda s: 70400.0, now_ms=resolve_ms)  # +10%

    assert settled == 1


def test_settle_due_skips_symbols_price_lookup_cannot_resolve(tmp_path):
    engine = _engine(tmp_path)
    called_ms = 1_000_000_000_000
    engine.record_call(
        "rss", "coindesk", "DELISTEDUSDT", "other", 1, score=0.5, confidence=0.8,
        entry_price=1.0, called_at_ms=called_ms,
    )

    resolve_ms = called_ms + 25 * 3600 * 1000
    settled = engine.settle_due(price_lookup=lambda s: None, now_ms=resolve_ms)

    assert settled == 0


def test_get_source_reliability_returns_neutral_prior_before_min_settled(tmp_path):
    engine = _engine(tmp_path, min_settled_for_score=5)
    called_ms = 1_000_000_000_000
    resolve_ms = called_ms + 25 * 3600 * 1000

    # Only 3 settled calls, below min_settled_for_score=5.
    for i in range(3):
        engine.record_call(
            "rss", "coindesk", f"SYM{i}USDT", "other", 1, score=0.8, confidence=0.9,
            entry_price=100.0, called_at_ms=called_ms,
        )
    engine.settle_due(price_lookup=lambda s: 110.0, now_ms=resolve_ms)

    assert engine.get_source_reliability("rss", "coindesk") == 0.5


def test_get_source_reliability_moves_off_neutral_with_consistent_settled_calls(tmp_path):
    engine = _engine(tmp_path, min_settled_for_score=5)
    called_ms = 1_000_000_000_000
    resolve_ms = called_ms + 25 * 3600 * 1000

    # Scores that vary bearish->bullish, with realized forward returns that agree with
    # each call's direction -- a clean, strongly positive IC.
    scores = [-0.8, -0.4, 0.0, 0.4, 0.8]
    exit_prices = {f"SYM{i}USDT": 100.0 * (1.0 + scores[i] * 0.1) for i in range(5)}
    for i, score in enumerate(scores):
        engine.record_call(
            "rss", "coindesk", f"SYM{i}USDT", "macro_fed", 3, score=score, confidence=0.9,
            entry_price=100.0, called_at_ms=called_ms,
        )
    engine.settle_due(price_lookup=lambda s: exit_prices[s], now_ms=resolve_ms)

    reliability = engine.get_source_reliability("rss", "coindesk")
    assert reliability > 0.9  # near-perfect linear agreement -> near 1.0


def test_get_reliability_summary_reports_not_established_before_minimum(tmp_path):
    engine = _engine(tmp_path, min_settled_for_score=5)
    summary = engine.get_reliability_summary("rss", "brand_new_source")
    assert "not yet established" in summary


class TestMultipleSourcesDoNotCollide:
    """Regression test, direct analog to test_llm_track_record.py's
    TestMultipleIndicatorsDoNotCollide: distinct source_keys' settled history must not be
    averaged together or leak into each other's reliability read."""

    def test_two_sources_with_opposite_track_records_score_independently(self, tmp_path):
        engine = _engine(tmp_path, min_settled_for_score=5)
        called_ms = 1_000_000_000_000
        resolve_ms = called_ms + 25 * 3600 * 1000

        scores = [-0.8, -0.4, 0.0, 0.4, 0.8]

        # source A: consistently right (score direction matches realized return).
        exit_prices_a = {f"A{i}USDT": 100.0 * (1.0 + scores[i] * 0.1) for i in range(5)}
        for i, score in enumerate(scores):
            engine.record_call(
                "rss", "source_a", f"A{i}USDT", "macro_fed", 3, score=score, confidence=0.9,
                entry_price=100.0, called_at_ms=called_ms,
            )

        # source B: consistently wrong (score direction opposes realized return).
        exit_prices_b = {f"B{i}USDT": 100.0 * (1.0 - scores[i] * 0.1) for i in range(5)}
        for i, score in enumerate(scores):
            engine.record_call(
                "rss", "source_b", f"B{i}USDT", "macro_fed", 3, score=score, confidence=0.9,
                entry_price=100.0, called_at_ms=called_ms,
            )

        exit_prices = {**exit_prices_a, **exit_prices_b}
        engine.settle_due(price_lookup=lambda s: exit_prices[s], now_ms=resolve_ms)

        reliability_a = engine.get_source_reliability("rss", "source_a")
        reliability_b = engine.get_source_reliability("rss", "source_b")

        assert reliability_a > 0.9
        assert reliability_b < 0.1
        assert reliability_a != reliability_b
