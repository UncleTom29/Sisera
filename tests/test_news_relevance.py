from __future__ import annotations

import pytest

from sisera.data.models import NewsItem
from sisera.scoring.news_relevance import CorroborationTracker, SeenNewsStore, build_alias_map, match_symbols


def _item(title: str, item_id: str = "id1", source_name: str = "test") -> NewsItem:
    return NewsItem(
        source_type="rss", source_name=source_name, item_id=item_id, title=title, url=None,
        published_ms=1_000_000_000_000,
    )


class TestBuildAliasMap:
    def test_derives_ticker_from_usdt_symbol(self):
        alias_map = build_alias_map({"BTCUSDT": "Bitcoin"})
        assert set(alias_map["BTCUSDT"]) == {"Bitcoin", "BTC"}

    def test_handles_missing_name(self):
        alias_map = build_alias_map({"INJUSDT": ""})
        assert alias_map["INJUSDT"] == ["INJ"]


class TestMatchSymbols:
    def test_matches_full_coin_name(self):
        alias_map = build_alias_map({"BTCUSDT": "Bitcoin"})
        matched = match_symbols(_item("Bitcoin hits new high"), alias_map)
        assert matched == ["BTCUSDT"]

    def test_matches_ticker(self):
        alias_map = build_alias_map({"INJUSDT": "Injective"})
        matched = match_symbols(_item("INJ founder announces resignation"), alias_map)
        assert matched == ["INJUSDT"]

    def test_does_not_match_ticker_as_substring_of_another_word(self):
        # "INJ" should not match inside "INJECTION" or similar
        alias_map = build_alias_map({"INJUSDT": "Injective"})
        matched = match_symbols(_item("New injection technology announced"), alias_map)
        assert matched == []

    def test_case_insensitive(self):
        alias_map = build_alias_map({"BTCUSDT": "Bitcoin"})
        matched = match_symbols(_item("bitcoin rallies today"), alias_map)
        assert matched == ["BTCUSDT"]

    def test_matches_multiple_symbols_in_one_headline(self):
        alias_map = build_alias_map({"BTCUSDT": "Bitcoin", "ETHUSDT": "Ethereum"})
        matched = match_symbols(_item("Bitcoin and Ethereum both rally"), alias_map)
        assert set(matched) == {"BTCUSDT", "ETHUSDT"}

    def test_no_match_returns_empty(self):
        alias_map = build_alias_map({"BTCUSDT": "Bitcoin"})
        matched = match_symbols(_item("Stock market update"), alias_map)
        assert matched == []

    def test_ignores_short_terms_under_two_chars(self):
        alias_map = build_alias_map({"XUSDT": "X"})
        matched = match_symbols(_item("A completely unrelated headline"), alias_map)
        assert matched == []

    def test_does_not_match_lowercase_ticker_used_as_ordinary_english_word(self):
        """Regression test: real live data surfaced a Telegram whale-alert message
        containing the ordinary phrase "[TX - link]" wrongly matching the LINK ticker.
        Bare tickers must match case-sensitively (real crypto news writes them in caps),
        while full display names stay case-insensitive."""
        alias_map = build_alias_map({"LINKUSDT": "Chainlink"})
        matched = match_symbols(
            _item("Big BTC transfer. [TX - link](https://example.com/tx)"), alias_map
        )
        assert matched == []

    def test_still_matches_uppercase_ticker(self):
        alias_map = build_alias_map({"LINKUSDT": "Chainlink"})
        matched = match_symbols(_item("LINK surges 12% on new integration"), alias_map)
        assert matched == ["LINKUSDT"]

    def test_still_matches_full_name_case_insensitively(self):
        alias_map = build_alias_map({"LINKUSDT": "Chainlink"})
        matched = match_symbols(_item("chainlink announces new partnership"), alias_map)
        assert matched == ["LINKUSDT"]


class TestSeenNewsStore:
    @pytest.fixture
    def store(self, tmp_path):
        return SeenNewsStore(db_path=str(tmp_path / "seen.db"))

    def test_first_call_returns_all_items_as_unseen(self, store):
        items = [_item("A", "id1"), _item("B", "id2")]
        assert store.filter_unseen(items) == items

    def test_second_call_with_same_items_returns_empty(self, store):
        items = [_item("A", "id1"), _item("B", "id2")]
        store.filter_unseen(items)
        assert store.filter_unseen(items) == []

    def test_only_new_items_returned_on_subsequent_call(self, store):
        store.filter_unseen([_item("A", "id1")])
        second_batch = [_item("A", "id1"), _item("C", "id3")]
        result = store.filter_unseen(second_batch)
        assert [it.item_id for it in result] == ["id3"]

    def test_empty_input_returns_empty(self, store):
        assert store.filter_unseen([]) == []


class TestCorroborationTracker:
    @pytest.fixture
    def tracker(self, tmp_path):
        return CorroborationTracker(db_path=str(tmp_path / "corroboration.db"), window_seconds=3600.0)

    def test_first_match_counts_one(self, tracker):
        count, sources = tracker.record_and_count(_item("A", "id1", "coindesk"), "BTCUSDT", now_ms=1_000_000_000_000)
        assert count == 1
        assert sources == ["rss:coindesk"]

    def test_second_distinct_source_in_window_counts_two(self, tracker):
        now_ms = 1_000_000_000_000
        tracker.record_and_count(_item("A", "id1", "coindesk"), "BTCUSDT", now_ms=now_ms)
        count, sources = tracker.record_and_count(
            _item("A similar headline", "id2", "cointelegraph"), "BTCUSDT", now_ms=now_ms + 60_000
        )
        assert count == 2
        assert set(sources) == {"rss:coindesk", "rss:cointelegraph"}

    def test_same_source_posting_twice_still_counts_one(self, tracker):
        now_ms = 1_000_000_000_000
        tracker.record_and_count(_item("A", "id1", "coindesk"), "BTCUSDT", now_ms=now_ms)
        count, sources = tracker.record_and_count(
            _item("A follow-up", "id2", "coindesk"), "BTCUSDT", now_ms=now_ms + 60_000
        )
        assert count == 1
        assert sources == ["rss:coindesk"]

    def test_match_outside_window_does_not_count(self, tracker):
        now_ms = 1_000_000_000_000
        tracker.record_and_count(_item("A", "id1", "coindesk"), "BTCUSDT", now_ms=now_ms)
        # 2 hours later, well past the 1-hour window -- the first match should be pruned.
        count, sources = tracker.record_and_count(
            _item("B", "id2", "cointelegraph"), "BTCUSDT", now_ms=now_ms + 2 * 3600 * 1000
        )
        assert count == 1
        assert sources == ["rss:cointelegraph"]

    def test_different_symbols_tracked_independently(self, tracker):
        now_ms = 1_000_000_000_000
        tracker.record_and_count(_item("A", "id1", "coindesk"), "BTCUSDT", now_ms=now_ms)
        count, sources = tracker.record_and_count(_item("B", "id2", "coindesk"), "ETHUSDT", now_ms=now_ms)
        assert count == 1
        assert sources == ["rss:coindesk"]
