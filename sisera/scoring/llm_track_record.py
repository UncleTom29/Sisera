"""Live accuracy tracking for LLM-generated indicators. See SCOPE.md §1, §5.

This is the mechanism that makes "let it earn trust over time" concrete rather than a
talking point: every live LLM call is persisted as a pending prediction; once enough real
calendar time has passed (resolve_after_hours -- long for llm_fundamental_analysis, since
fundamentals are a slow signal; much shorter for news_sentiment, which is meant to be
judged fast), it's settled against the coin's actual realized forward return and fed into
the exact same IndicatorRelevancePruner every other indicator earns or loses trust through
(see sisera/scoring/relevance.py). If it doesn't pan out, the pruner will drop it from live
scoring the same way it would drop a technical indicator that failed its relevance check --
no separate, special-cased trust mechanism for either LLM indicator.

Deliberately never used in backtesting -- see NOT_BACKTESTABLE_INDICATORS in
sisera/backtest/engine.py for why an LLM's "historical" judgment can't be trusted the way a
real historical price series can. This module only ever settles calls that were actually
made live, against returns that actually, subsequently happened.

One instance tracks exactly one indicator_name (llm_fundamental_analysis or
news_sentiment) -- each gets its own table and reports under its own name to the pruner, so
one indicator's accuracy is never misattributed to the other's relevance record.
"""

from __future__ import annotations

import logging
import re
import sqlite3
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager
from dataclasses import dataclass

import numpy as np

from sisera.config import config
from sisera.scoring.relevance import IndicatorRelevancePruner

logger = logging.getLogger(__name__)


@dataclass
class SettledCall:
    symbol: str
    score: float
    confidence: float
    entry_price: float
    exit_price: float
    forward_return: float
    called_at_ms: int
    settled_at_ms: int


class LLMTrackRecord:
    """Persists live LLM fundamental calls and settles them against realized forward
    returns once resolve_after_hours has elapsed, feeding outcomes into an
    IndicatorRelevancePruner."""

    def __init__(
        self,
        db_path: str,
        relevance_pruner: IndicatorRelevancePruner,
        indicator_name: str = "llm_fundamental_analysis",
        resolve_after_hours: float | None = None,
        min_settled_for_evaluation: int = 10,
        rolling_window: int = 60,
    ) -> None:
        self._db_path = db_path
        self.relevance_pruner = relevance_pruner
        self.indicator_name = indicator_name
        self._table = "llm_calls_" + re.sub(r"[^a-zA-Z0-9_]", "_", indicator_name)
        self.resolve_after_hours = (
            resolve_after_hours
            if resolve_after_hours is not None
            else config.llm_fundamental_resolve_after_hours
        )
        self.min_settled_for_evaluation = min_settled_for_evaluation
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
                CREATE TABLE IF NOT EXISTS {self._table} (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    cluster TEXT NOT NULL,
                    score REAL NOT NULL,
                    confidence REAL NOT NULL,
                    reasoning TEXT NOT NULL DEFAULT '',
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
                f"CREATE INDEX IF NOT EXISTS idx_{self._table}_pending "
                f"ON {self._table} (settled, resolve_at_ms)"
            )

    def record_call(
        self,
        symbol: str,
        timeframe: str,
        cluster: str,
        score: float,
        confidence: float,
        reasoning: str,
        entry_price: float,
        called_at_ms: int | None = None,
    ) -> None:
        """Persists a live LLM call as a pending prediction, to be judged once
        resolve_after_hours has actually elapsed."""
        called_ms = called_at_ms if called_at_ms is not None else int(time.time() * 1000)
        resolve_ms = called_ms + int(self.resolve_after_hours * 3600 * 1000)
        with self._connect() as conn:
            conn.execute(
                f"""
                INSERT INTO {self._table}
                    (symbol, timeframe, cluster, score, confidence, reasoning,
                     entry_price, called_at_ms, resolve_at_ms, settled)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
                """,
                (
                    symbol, timeframe, cluster, score, confidence, reasoning,
                    entry_price, called_ms, resolve_ms,
                ),
            )

    def settle_due(
        self,
        price_lookup: Callable[[str], float | None],
        now_ms: int | None = None,
    ) -> int:
        """Settles every pending call whose resolve time has passed, using `price_lookup`
        (typically a live ticker fetch) to get each symbol's current price. Feeds the
        resulting rolling-window Information Coefficient into the relevance pruner as one
        new evaluation snapshot per (timeframe, cluster) with newly-settled calls -- the
        exact same trend-based pruning logic every backtested indicator goes through.
        Returns the number of calls settled.
        """
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT id, symbol, timeframe, cluster, entry_price, called_at_ms
                FROM {self._table}
                WHERE settled = 0 AND resolve_at_ms <= ?
                """,
                (now,),
            ).fetchall()

        if not rows:
            return 0

        settled_count = 0
        touched_groups: set[tuple[str, str]] = set()
        with self._connect() as conn:
            for row_id, symbol, timeframe, cluster, entry_price, _called_at_ms in rows:
                exit_price = price_lookup(symbol)
                if exit_price is None or entry_price <= 0:
                    continue
                forward_return = (exit_price - entry_price) / entry_price
                conn.execute(
                    f"""
                    UPDATE {self._table}
                    SET settled = 1, exit_price = ?, forward_return = ?, settled_at_ms = ?
                    WHERE id = ?
                    """,
                    (exit_price, forward_return, now, row_id),
                )
                settled_count += 1
                touched_groups.add((timeframe, cluster))

        for timeframe, cluster in touched_groups:
            self._record_relevance_snapshot(timeframe, cluster)

        if settled_count:
            logger.info("%s track record: settled %d call(s)", self.indicator_name, settled_count)
        return settled_count

    def _record_relevance_snapshot(self, timeframe: str, cluster: str) -> None:
        """Recomputes the rolling-window IC over this (timeframe, cluster)'s most recent
        settled calls and records it as one new relevance-pruner evaluation -- mirroring
        the per-chunk IC snapshots the backtest engine records, just driven by real elapsed
        time instead of historical replay."""
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT score, forward_return FROM {self._table}
                WHERE settled = 1 AND timeframe = ? AND cluster = ?
                ORDER BY settled_at_ms DESC LIMIT ?
                """,
                (timeframe, cluster, self.rolling_window),
            ).fetchall()

        if len(rows) < self.min_settled_for_evaluation:
            return

        scores = np.array([r[0] for r in rows], dtype=float)
        returns = np.array([r[1] for r in rows], dtype=float)
        if float(np.std(scores)) < 1e-9:
            ic = 0.0
        else:
            corr = float(np.corrcoef(scores, returns)[0, 1])
            ic = 0.0 if np.isnan(corr) else corr

        self.relevance_pruner.record_evaluation(timeframe, cluster, self.indicator_name, ic)
        logger.info(
            "%s live IC (%s/%s, n=%d): %+.3f", self.indicator_name, timeframe, cluster, len(rows), ic
        )

    def pending_count(self) -> int:
        with self._connect() as conn:
            return conn.execute(f"SELECT COUNT(*) FROM {self._table} WHERE settled = 0").fetchone()[0]

    def settled_count(self) -> int:
        with self._connect() as conn:
            return conn.execute(f"SELECT COUNT(*) FROM {self._table} WHERE settled = 1").fetchone()[0]

    def recent_settled(self, limit: int = 50) -> list[SettledCall]:
        with self._connect() as conn:
            rows = conn.execute(
                f"""
                SELECT symbol, score, confidence, entry_price, exit_price, forward_return,
                       called_at_ms, settled_at_ms
                FROM {self._table}
                WHERE settled = 1
                ORDER BY settled_at_ms DESC LIMIT ?
                """,
                (limit,),
            ).fetchall()
        return [
            SettledCall(
                symbol=r[0], score=r[1], confidence=r[2], entry_price=r[3], exit_price=r[4],
                forward_return=r[5], called_at_ms=r[6], settled_at_ms=r[7],
            )
            for r in rows
        ]
