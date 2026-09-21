"""Hard daily spend cap for X/Twitter API usage. See SCOPE.md §5.

X discontinued its free API tier in February 2026 -- read access is now pay-per-use only
($0.005/post read, no free allowance, confirmed live this session), with cost scaling
directly with the VOLUME of posts a search call returns, not the number of calls made. That
asymmetry is the risk this module exists to bound: a quiet news day returns few matching
posts and costs almost nothing, while a high-volume day (a Fed surprise, a war escalation,
an oil shock) returns far more matching posts from the fast-news accounts this feature
tracks -- exactly the day this feature is meant to be most useful, and exactly the day an
uncapped integration would spend the most without anyone deciding that in the moment.

XClient MUST consult would_exceed() before every call and refuse (returning no results)
once the day's cap is hit, rather than calling first and finding out the cost afterward.
"""

from __future__ import annotations

import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager
from datetime import datetime, timezone

from sisera.config import config


def _utc_date_str(now_ms: int | None = None) -> str:
    ts = (now_ms if now_ms is not None else int(time.time() * 1000)) / 1000.0
    return datetime.fromtimestamp(ts, tz=timezone.utc).strftime("%Y-%m-%d")


class XSpendTracker:
    """Tracks cumulative $-per-post-read spend for the current UTC day, persisted so the
    cap survives a process restart within the same day."""

    def __init__(self, db_path: str, max_daily_spend_usd: float | None = None) -> None:
        self._db_path = db_path
        self.max_daily_spend_usd = (
            max_daily_spend_usd if max_daily_spend_usd is not None else config.x_max_daily_spend_usd
        )
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
                CREATE TABLE IF NOT EXISTS x_daily_spend (
                    utc_date TEXT PRIMARY KEY,
                    spend_usd REAL NOT NULL DEFAULT 0.0
                )
                """
            )

    def record_reads(self, count: int, now_ms: int | None = None) -> None:
        """Adds count * config.x_cost_per_read_usd to today's cumulative spend."""
        if count <= 0:
            return
        cost = count * config.x_cost_per_read_usd
        date_str = _utc_date_str(now_ms)
        with self._connect() as conn:
            conn.execute(
                """
                INSERT INTO x_daily_spend (utc_date, spend_usd) VALUES (?, ?)
                ON CONFLICT(utc_date) DO UPDATE SET spend_usd = spend_usd + excluded.spend_usd
                """,
                (date_str, cost),
            )

    def today_spend_usd(self, now_ms: int | None = None) -> float:
        date_str = _utc_date_str(now_ms)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT spend_usd FROM x_daily_spend WHERE utc_date = ?", (date_str,)
            ).fetchone()
        return float(row[0]) if row else 0.0

    def remaining_budget_usd(self, now_ms: int | None = None) -> float:
        return max(0.0, self.max_daily_spend_usd - self.today_spend_usd(now_ms))

    def would_exceed(self, estimated_reads: int, now_ms: int | None = None) -> bool:
        """True if making a call for up to `estimated_reads` posts could push today's
        spend past the cap. Checked BEFORE calling, not after -- see module docstring."""
        estimated_cost = estimated_reads * config.x_cost_per_read_usd
        return self.today_spend_usd(now_ms) + estimated_cost > self.max_daily_spend_usd
