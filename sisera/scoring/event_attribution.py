"""Event Attribution Engine: per-SOURCE (not per-indicator) empirical reliability. See
SCOPE.md §1, §5.

A genuinely different dimension from sisera/scoring/relevance.py's IndicatorRelevancePruner
and llm_track_record.py's LLMTrackRecord, which both ask "is the news_sentiment indicator,
as a whole, worth computing for (timeframe, cluster)" -- this asks "has THIS SPECIFIC
SOURCE (a particular RSS feed, Telegram channel, or X account) historically been right,"
independent of which indicator family carried its content. Every source starts at exactly
the same neutral prior (0.5) regardless of name recognition -- "Reuters" and an unknown
Telegram channel begin identically and earn their score from real settled outcomes, per the
same "these are engineering weights, calibrate them empirically" principle the whole
event-intelligence layer is built around. No hardcoded authority-implying starting weights.

Deliberately does NOT reuse IndicatorRelevancePruner directly: that class's key schema is
(timeframe, cluster, indicator_name) with no slot for source_name, and conflating "is this
indicator family worth computing" with "is this specific feed trustworthy" would make both
harder to reason about. This engine's public surface (get_source_reliability -> float) is
continuous from the start; sources aren't "computed" the way indicators are, so there's no
equivalent prune-from-computation boolean to maintain here.
"""

from __future__ import annotations

import logging
import sqlite3
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager

import numpy as np

from sisera.config import config

logger = logging.getLogger(__name__)

_TABLE = "event_attribution_calls"


def source_key(source_type: str, source_name: str) -> str:
    """"rss:cointelegraph" vs "telegram:cointelegraph" stay distinct tracked identities --
    same channel name, different distribution mechanism, potentially different real
    accuracy (e.g. a Telegram channel re-posting a headline faster but less carefully
    edited than the same outlet's own RSS feed)."""
    return f"{source_type}:{source_name}"


class EventAttributionEngine:
    """Persists live news-driven calls per-source and settles them against realized
    forward returns, exposing a continuous, empirically-earned reliability score."""

    def __init__(
        self,
        db_path: str,
        resolve_after_hours: float | None = None,
        min_settled_for_score: int = 10,
        rolling_window: int = 30,
    ) -> None:
        self._db_path = db_path
        self.resolve_after_hours = (
            resolve_after_hours if resolve_after_hours is not None else config.news_resolve_after_hours
        )
        self.min_settled_for_score = min_settled_for_score
        self.rolling_window = rolling_window
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
                f"""
                CREATE TABLE IF NOT EXISTS {_TABLE} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    source_key TEXT NOT NULL,
                    symbol TEXT NOT NULL,
                    event_category TEXT NOT NULL DEFAULT 'other',
                    severity INTEGER NOT NULL DEFAULT 1,
                    score REAL NOT NULL,
                    confidence REAL NOT NULL,
                    entry_price REAL NOT NULL,
                    called_at_ms INTEGER NOT NULL,
                    resolve_at_ms INTEGER NOT NULL,
                    settled INTEGER NOT NULL DEFAULT 0,
                    exit_price REAL,
                    forward_return REAL,
                    settled_at_ms INTEGER
                )
                """
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{_TABLE}_pending ON {_TABLE} (settled, resolve_at_ms)"
            )
            conn.execute(
                f"CREATE INDEX IF NOT EXISTS idx_{_TABLE}_source ON {_TABLE} (source_key, settled_at_ms)"
            )

    def record_call(
        self,
        source_type: str,
        source_name: str,
        symbol: str,
        event_category: str,
        severity: int,
        score: float,
        confidence: float,
        entry_price: float,
        called_at_ms: int | None = None,
    ) -> None:
        """Persists one live news-triage call as a pending prediction, attributed to
        whichever source produced it."""
        called_ms = called_at_ms if called_at_ms is not None else int(time.time() * 1000)
        resolve_ms = called_ms + int(self.resolve_after_hours * 3600 * 1000)
        with self._connect() as conn:
            conn.execute(
                f"""
                INSERT INTO {_TABLE}
                    (source_key, symbol, event_category, severity, score, confidence,
                     entry_price, called_at_ms, resolve_at_ms, settled)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (
                    source_key(source_type, source_name), symbol, event_category, severity,
                    score, confidence, entry_price, called_ms, resolve_ms,
                ),
            )

    def settle_due(self, price_lookup: Callable[[str], float | None], now_ms: int | None = None) -> int:
        """Settles every pending call whose resolve time has passed, using `price_lookup`
        (typically a live ticker fetch) to get each symbol's current price. Returns the
        number of calls settled. Unlike LLMTrackRecord, doesn't report into
        IndicatorRelevancePruner -- get_source_reliability below reads the settled rows
        directly instead of maintaining a separate rolling snapshot history."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        with self._connect() as conn:
            rows = conn.execute(
                f"SELECT id, symbol, entry_price FROM {_TABLE} WHERE settled = 0 AND resolve_at_ms <= ?",
                (now,),
            ).fetchall()

        if not rows:
            return 0

        settled_count = 0
        with self._connect() as conn:
            for row_id, symbol, entry_price in rows:
                exit_price = price_lookup(symbol)
                if exit_price is None or entry_price <= 0:
                    continue
                forward_return = (exit_price - entry_price) / entry_price
                conn.execute(
                    f"""
                    UPDATE {_TABLE}
                    SET settled = 1, exit_price = ?, forward_return = ?, settled_at_ms = ?
                    WHERE id = ?
                    """,
                    (exit_price, forward_return, now, row_id),
                )
                settled_count += 1

        if settled_count:
            logger.info("Event Attribution Engine: settled %d call(s)", settled_count)
        return settled_count

    def _settled_rows_for_source(self, key: str) -> list[tuple[float, float]]:
        with self._connect() as conn:
            return conn.execute(
                f"""
                SELECT score, forward_return FROM {_TABLE}
                WHERE settled = 1 AND source_key = ?
                ORDER BY settled_at_ms DESC LIMIT ?
                """,
                (key, self.rolling_window),
            ).fetchall()

    def get_source_reliability(self, source_type: str, source_name: str) -> float:
        """0.5 + rolling_IC*0.5, clipped to [0, 1]. Cold start (fewer than
        min_settled_for_score settled calls): returns exactly 0.5, the neutral prior --
        no source starts above or below neutral regardless of name recognition."""
        rows = self._settled_rows_for_source(source_key(source_type, source_name))
        if len(rows) < self.min_settled_for_score:
            return 0.5

        scores = np.array([r[0] for r in rows], dtype=float)
        returns = np.array([r[1] for r in rows], dtype=float)
        if float(np.std(scores)) < 1e-9:
            ic = 0.0
        else:
            corr = float(np.corrcoef(scores, returns)[0, 1])
            ic = 0.0 if np.isnan(corr) else corr

        return max(0.0, min(1.0, 0.5 + ic * 0.5))

    def get_reliability_summary(self, source_type: str, source_name: str) -> str:
        """Human-readable line for LLM prompt injection (see
        OpenRouterClient.assess_news_headline's extra_context param)."""
        rows = self._settled_rows_for_source(source_key(source_type, source_name))
        if len(rows) < self.min_settled_for_score:
            return f"source track record: not yet established ({len(rows)} settled calls)"

        reliability = self.get_source_reliability(source_type, source_name)
        rolling_ic = (reliability - 0.5) * 2.0
        return (
            f"source track record: {len(rows)} settled calls, rolling correlation "
            f"{rolling_ic:+.2f} with realized moves"
        )
