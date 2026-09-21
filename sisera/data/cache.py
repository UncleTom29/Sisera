from __future__ import annotations

import json
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any


class Cache:
    """Generic TTL cache backed by SQLite. See SCOPE.md §3: 'Caching is mandatory, not optional.'"""

    def __init__(self, db_path: str) -> None:
        self._db_path = db_path
        self._init_schema()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        conn = sqlite3.connect(self._db_path)
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_schema(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS cache_entries (
                    key TEXT PRIMARY KEY,
                    value TEXT NOT NULL,
                    fetched_at REAL NOT NULL,
                    ttl_seconds REAL NOT NULL
                )
                """
            )

    def get(self, key: str) -> Any | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT value, fetched_at, ttl_seconds FROM cache_entries WHERE key = ?",
                (key,),
            ).fetchone()
        if row is None:
            return None
        value, fetched_at, ttl_seconds = row
        if time.time() - fetched_at > ttl_seconds:
            return None
        return json.loads(value)

    def set(self, key: str, value: Any, ttl_seconds: float) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO cache_entries (key, value, fetched_at, ttl_seconds)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    fetched_at = excluded.fetched_at,
                    ttl_seconds = excluded.ttl_seconds
                """,
                (key, json.dumps(value), time.time(), ttl_seconds),
            )
