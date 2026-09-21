from __future__ import annotations

import json

from sisera.data.liquidation_stream import LiquidationStream, parse_liquidation_message
from sisera.data.models import LiquidationEvent


class TestParseLiquidationMessage:
    def test_parses_single_event(self):
        message = {
            "topic": "allLiquidation.BTCUSDT",
            "type": "snapshot",
            "ts": 1700000000000,
            "data": [{"T": 1700000000000, "s": "BTCUSDT", "S": "Sell", "v": "0.5", "p": "50000.0"}],
        }
        events = parse_liquidation_message(message)
        assert len(events) == 1
        assert events[0].symbol == "BTCUSDT"
        assert events[0].side == "Sell"
        assert events[0].price == 50000.0
        assert events[0].size == 0.5
        assert events[0].notional == 25000.0

    def test_parses_multiple_events_in_one_message(self):
        message = {
            "topic": "allLiquidation.ETHUSDT",
            "data": [
                {"T": 1700000000000, "s": "ETHUSDT", "S": "Sell", "v": "1", "p": "3000"},
                {"T": 1700000000100, "s": "ETHUSDT", "S": "Buy", "v": "2", "p": "3001"},
            ],
        }
        events = parse_liquidation_message(message)
        assert len(events) == 2

    def test_ignores_non_liquidation_topics(self):
        message = {"topic": "orderbook.25.BTCUSDT", "data": []}
        assert parse_liquidation_message(message) == []

    def test_missing_topic_key_returns_empty(self):
        assert parse_liquidation_message({}) == []


class TestLiquidationStreamBuffer:
    def _event(self, symbol: str, timestamp_ms: int, side: str = "Sell") -> LiquidationEvent:
        return LiquidationEvent(
            symbol=symbol, side=side, price=100.0, size=1.0, timestamp_ms=timestamp_ms
        )

    def test_ingest_then_recent_events_round_trips(self):
        stream = LiquidationStream(["BTCUSDT"], clock=lambda: 1000.0)
        stream.ingest(self._event("BTCUSDT", timestamp_ms=999_500))
        events = stream.recent_events("BTCUSDT")
        assert len(events) == 1

    def test_events_older_than_window_are_pruned(self):
        clock = {"now": 1000.0}
        stream = LiquidationStream(["BTCUSDT"], buffer_window_seconds=60, clock=lambda: clock["now"])
        stream.ingest(self._event("BTCUSDT", timestamp_ms=int(1000.0 * 1000)))  # fresh
        clock["now"] = 1000.0 + 120  # 120s later — older than the 60s window now
        assert stream.recent_events("BTCUSDT") == []

    def test_events_within_window_survive(self):
        clock = {"now": 1000.0}
        stream = LiquidationStream(["BTCUSDT"], buffer_window_seconds=300, clock=lambda: clock["now"])
        stream.ingest(self._event("BTCUSDT", timestamp_ms=int(1000.0 * 1000)))
        clock["now"] = 1000.0 + 60  # within the 300s window
        assert len(stream.recent_events("BTCUSDT")) == 1

    def test_buffers_are_per_symbol(self):
        stream = LiquidationStream(["BTCUSDT", "ETHUSDT"], clock=lambda: 1000.0)
        stream.ingest(self._event("BTCUSDT", timestamp_ms=999_500))
        assert len(stream.recent_events("BTCUSDT")) == 1
        assert len(stream.recent_events("ETHUSDT")) == 0

    def test_unknown_symbol_returns_empty_not_an_error(self):
        stream = LiquidationStream(["BTCUSDT"], clock=lambda: 1000.0)
        assert stream.recent_events("NEVERSUBSCRIBEDUSDT") == []


class TestLiquidationStreamSubscription:
    def test_on_open_sends_subscribe_message_for_all_symbols(self):
        stream = LiquidationStream(["BTCUSDT", "ETHUSDT"])
        sent = {}

        class _FakeWs:
            def send(self, payload):
                sent["payload"] = json.loads(payload)

        stream._on_open(_FakeWs())

        assert sent["payload"] == {
            "op": "subscribe",
            "args": ["allLiquidation.BTCUSDT", "allLiquidation.ETHUSDT"],
        }

    def test_on_message_ingests_parsed_events(self):
        stream = LiquidationStream(["BTCUSDT"], clock=lambda: 1_700_000_000.0)
        raw = json.dumps(
            {
                "topic": "allLiquidation.BTCUSDT",
                "data": [{"T": 1_700_000_000_000, "s": "BTCUSDT", "S": "Sell", "v": "1", "p": "50000"}],
            }
        )
        stream._on_message(ws=None, raw_message=raw)
        assert len(stream.recent_events("BTCUSDT")) == 1

    def test_on_message_ignores_malformed_json(self):
        stream = LiquidationStream(["BTCUSDT"], clock=lambda: 1000.0)
        stream._on_message(ws=None, raw_message="not json{{{")  # should not raise
        assert stream.recent_events("BTCUSDT") == []
