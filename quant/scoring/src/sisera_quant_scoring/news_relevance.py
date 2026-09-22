"""Keyword matching and dedup tracking for the breaking-news monitor. See SCOPE.md §5.

Two independent, cheap, non-LLM steps that run before any paid API call: does a headline
mention a symbol we care about, and have we already processed it. This is what makes the
cheap-filter-then-expensive-verify pattern actually cheap -- almost every fetched headline
gets discarded here at zero cost, and only real matches ever reach the LLM assessment step.
"""

from __future__ import annotations

import re
import sqlite3
import time
from collections.abc import Iterator
from contextlib import contextmanager

from sisera.data.models import NewsItem
from sisera_quant_scoring.event_attribution import source_key


def build_alias_map(symbol_names: dict[str, str]) -> dict[str, list[str]]:
    """Builds {symbol: [match terms]} from {symbol: display_name}, e.g.
    {"BTCUSDT": "Bitcoin"} -> {"BTCUSDT": ["Bitcoin", "BTC"]}. The base-coin ticker is
    derived by stripping the "USDT" suffix Bybit symbols always carry.
    """
    alias_map: dict[str, list[str]] = {}
    for symbol, name in symbol_names.items():
        ticker = symbol[:-4] if symbol.endswith("USDT") else symbol
        terms = {name} if name else set()
        terms.add(ticker)
        alias_map[symbol] = sorted(terms)
    return alias_map


def match_symbols(item: NewsItem, alias_map: dict[str, list[str]]) -> list[str]:
    """Returns every symbol whose name or ticker appears as a whole word in the item's
    title. Word-boundary matching, not substring -- a naive substring check on a 3-4
    letter ticker collides constantly with ordinary English words (e.g. "INJ" inside
    "injection").

    Full display names (e.g. "Bitcoin", "Chainlink") match case-insensitively -- they
    essentially never collide with ordinary lowercase words. Bare tickers match
    case-SENSITIVELY instead: real crypto news/social media near-universally writes
    tickers in full uppercase ("BTC", "$LINK"), while the same string used as an ordinary
    English word is virtually always lowercase or only sentence-capitalized ("link",
    "Link") -- e.g. a Telegram message containing the ordinary phrase "[TX - link]" would
    otherwise wrongly match the LINK ticker under case-insensitive matching, exactly the
    kind of false positive word-boundary matching alone doesn't catch since "link" isn't a
    substring of a larger word, it just *is* the word. Several real tickers collide with
    common English words this way (LINK, ONE, ICE, BAT, ...), so this is a general fix,
    not a one-off special case.
    """
    matched: list[str] = []
    for symbol, terms in alias_map.items():
        ticker = symbol[:-4] if symbol.endswith("USDT") else symbol
        for term in terms:
            if not term or len(term) < 2:
                continue
            pattern = r"(?<![A-Za-z0-9])" + re.escape(term) + r"(?![A-Za-z0-9])"
            flags = 0 if term == ticker else re.IGNORECASE
            if re.search(pattern, item.title, flags):
                matched.append(symbol)
                break
    return matched


class SeenNewsStore:
    """Tracks which NewsItem ids have already been processed, so the same headline from
    the same feed doesn't get re-matched/re-assessed on every poll cycle. Old entries are
    pruned automatically -- news relevance decays fast, no need to remember forever."""

    def __init__(self, db_path: str, retention_hours: float = 72.0) -> None:
        self._db_path = db_path
        self._retention_ms = int(retention_hours * 3600 * 1000)
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
                CREATE TABLE IF NOT EXISTS seen_news_items (
                    item_id TEXT PRIMARY KEY,
                    seen_at_ms INTEGER NOT NULL
                )
                """
            )

    def filter_unseen(self, items: list[NewsItem]) -> list[NewsItem]:
        """Returns only the items not already marked seen, then marks all of them seen
        (including the ones filtered out, which were already marked on a prior call)."""
        now_ms = int(time.time() * 1000)
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM seen_news_items WHERE seen_at_ms < ?", (now_ms - self._retention_ms,)
            )
            existing_ids = {
                row[0]
                for row in conn.execute(
                    "SELECT item_id FROM seen_news_items WHERE item_id IN ({})".format(
                        ",".join("?" * len(items))
                    ),
                    [it.item_id for it in items],
                )
            } if items else set()

            unseen = [it for it in items if it.item_id not in existing_ids]

            conn.executemany(
                "INSERT OR IGNORE INTO seen_news_items (item_id, seen_at_ms) VALUES (?, ?)",
                [(it.item_id, now_ms) for it in items],
            )
        return unseen


class CorroborationTracker:
    """Cheap proxy for "N distinct sources reported this" = N distinct sources matched the
    same symbol within window_seconds. No NLP/text-similarity dependency, matching
    match_symbols' cheap-filter-first design -- at the cost of precision: two unrelated
    stories about the same coin in-window register as false corroboration. Acceptable for
    a v1 signal that only nudges an LLM's own confidence (see extra_context on
    OpenRouterClient.assess_news_headline), not a standalone gate on its own."""

    def __init__(self, db_path: str, window_seconds: float = 3600.0) -> None:
        self._db_path = db_path
        self._window_ms = int(window_seconds * 1000)
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
                CREATE TABLE IF NOT EXISTS news_corroboration_matches (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    symbol TEXT NOT NULL,
                    source_key TEXT NOT NULL,
                    item_id TEXT NOT NULL,
                    matched_at_ms INTEGER NOT NULL
                )
                """
            )
            conn.execute(
                "CREATE INDEX IF NOT EXISTS idx_corroboration_symbol "
                "ON news_corroboration_matches (symbol, matched_at_ms)"
            )

    def record_and_count(
        self, item: NewsItem, symbol: str, now_ms: int | None = None
    ) -> tuple[int, list[str]]:
        """Records this (symbol, source) match, prunes rows older than window_seconds,
        and returns (distinct_source_count, source_keys) for `symbol` within the window,
        including this item's own source."""
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        key = source_key(item.source_type, item.source_name)
        with self._connect() as conn:
            conn.execute(
                "DELETE FROM news_corroboration_matches WHERE matched_at_ms < ?", (now - self._window_ms,)
            )
            conn.execute(
                """
                INSERT INTO news_corroboration_matches (symbol, source_key, item_id, matched_at_ms)
                VALUES (?, ?, ?, ?)
                """,
                (symbol, key, item.item_id, now),
            )
            rows = conn.execute(
                "SELECT DISTINCT source_key FROM news_corroboration_matches WHERE symbol = ?",
                (symbol,),
            ).fetchall()
        source_keys = [r[0] for r in rows]
        return len(source_keys), source_keys
