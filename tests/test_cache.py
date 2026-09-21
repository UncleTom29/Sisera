from __future__ import annotations

import time

from sisera.data.cache import Cache


def test_set_then_get_round_trips(tmp_path):
    cache = Cache(str(tmp_path / "test.db"))
    cache.set("k", {"a": 1, "b": [1, 2, 3]}, ttl_seconds=60)
    assert cache.get("k") == {"a": 1, "b": [1, 2, 3]}


def test_missing_key_returns_none(tmp_path):
    cache = Cache(str(tmp_path / "test.db"))
    assert cache.get("nope") is None


def test_expired_entry_returns_none(tmp_path):
    cache = Cache(str(tmp_path / "test.db"))
    cache.set("k", "v", ttl_seconds=0.01)
    time.sleep(0.05)
    assert cache.get("k") is None


def test_set_overwrites_existing_key(tmp_path):
    cache = Cache(str(tmp_path / "test.db"))
    cache.set("k", "first", ttl_seconds=60)
    cache.set("k", "second", ttl_seconds=60)
    assert cache.get("k") == "second"
