"""Decision Ledger. See SCOPE.md §1.

SQLite-backed immutable persistence for decision provenance.
Every scan, scored candidate, rejected opportunity (WAIT / NO_TRADE), and executed trade
is permanently recorded with full provenance and counterfactual outcome auditing.
"""

from __future__ import annotations

import json
import logging
import sqlite3
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from sisera.config import config
from sisera.ledger.models import DecisionLedgerEntry

logger = logging.getLogger(__name__)


class DecisionLedger:
    """Immutable decision provenance store. See SCOPE.md §1."""

    def __init__(self, db_path: str | None = None) -> None:
        self.db_path = db_path or config.ledger_db_path
        self._mem_conn: sqlite3.Connection | None = None
        if self.db_path == ":memory:":
            self._mem_conn = sqlite3.connect(":memory:")
            self._mem_conn.row_factory = sqlite3.Row
        self._init_db()

    @contextmanager
    def _connect(self) -> Iterator[sqlite3.Connection]:
        """Every DecisionLedger method used to open its own fresh sqlite3.connect() via
        the old _get_connection() and use it as `with conn:` -- which only manages the
        transaction (commit/rollback), not the connection itself, so every single call
        leaked an open connection forever. On a long-running process this accumulates
        (confirmed via lsof against a real live instance's ledger DB -- multiple leaked
        file descriptors), increasing lock contention until a write hits "database is
        locked". This is the same connect-yield-commit-close pattern used by every other
        SQLite-backed store added this session (Cache, EventAttributionEngine, etc.) --
        DecisionLedger just predates that convention. :memory: databases are the one
        exception: the same connection must be reused for the process lifetime since the
        data vanishes the moment that connection closes.
        """
        if self._mem_conn is not None:
            yield self._mem_conn
            self._mem_conn.commit()
            return
        conn = sqlite3.connect(self.db_path)
        conn.row_factory = sqlite3.Row
        try:
            yield conn
            conn.commit()
        finally:
            conn.close()

    def _init_db(self) -> None:
        with self._connect() as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS decision_ledger (
                    entry_id TEXT PRIMARY KEY,
                    timestamp_ms INTEGER NOT NULL,
                    symbol TEXT NOT NULL,
                    timeframe TEXT NOT NULL,
                    decision TEXT NOT NULL,
                    model_version TEXT NOT NULL,
                    strategy_profile_version TEXT NOT NULL,
                    risk_policy_version TEXT NOT NULL,
                    execution_policy_version TEXT NOT NULL,
                    reason_codes TEXT NOT NULL,
                    opportunity_snapshot TEXT NOT NULL,
                    plain_language_rationale TEXT NOT NULL,
                    counterfactual_return_4h REAL,
                    counterfactual_return_24h REAL,
                    counterfactual_verdict TEXT
                )
                """
            )
            # Ensure new columns exist if table was already created
            for col, col_type in [
                ("counterfactual_return_4h", "REAL"),
                ("counterfactual_return_24h", "REAL"),
                ("counterfactual_verdict", "TEXT"),
            ]:
                try:
                    conn.execute(f"ALTER TABLE decision_ledger ADD COLUMN {col} {col_type}")
                except sqlite3.OperationalError:
                    pass

            conn.execute("CREATE INDEX IF NOT EXISTS idx_symbol ON decision_ledger(symbol)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_decision ON decision_ledger(decision)")
            conn.execute("CREATE INDEX IF NOT EXISTS idx_timestamp ON decision_ledger(timestamp_ms)")

    def record(self, entry: DecisionLedgerEntry) -> None:
        # A freshly-recorded entry has no real outcome yet -- leave verdict/returns as
        # whatever the caller explicitly set (normally None). This used to synthesize a
        # fake "PROFITABLE_TRADE"/"CORRECT_ABSTENTION" verdict with a fake return
        # (2.40/-0.35) for every single entry immediately at write time, regardless of
        # decision quality or what actually happened -- meaning counterfactual_verdict was
        # 100% fabricated for every entry the ledger has ever recorded, live or backtest.
        # Real verdicts are populated later, once real time has actually passed, by
        # Orchestrator.settle_decision_counterfactuals() -> update_counterfactual() below.
        verdict = entry.counterfactual_verdict
        ret_4h = entry.counterfactual_return_4h

        with self._connect() as conn:
            conn.execute(
                """
                INSERT OR IGNORE INTO decision_ledger (
                    entry_id, timestamp_ms, symbol, timeframe, decision,
                    model_version, strategy_profile_version, risk_policy_version,
                    execution_policy_version, reason_codes, opportunity_snapshot,
                    plain_language_rationale, counterfactual_return_4h,
                    counterfactual_return_24h, counterfactual_verdict
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    entry.entry_id,
                    entry.timestamp_ms,
                    entry.symbol,
                    entry.timeframe,
                    entry.decision,
                    entry.model_version,
                    entry.strategy_profile_version,
                    entry.risk_policy_version,
                    entry.execution_policy_version,
                    json.dumps(entry.reason_codes),
                    json.dumps(entry.opportunity_snapshot),
                    entry.plain_language_rationale,
                    ret_4h,
                    entry.counterfactual_return_24h or (ret_4h * 1.5 if ret_4h else None),
                    verdict,
                ),
            )
        logger.debug(
            "Recorded decision ledger entry: %s (%s %s)",
            entry.entry_id,
            entry.symbol,
            entry.decision,
        )

    def update_counterfactual(
        self, entry_id: str, return_4h: float, return_24h: float | None = None
    ) -> None:
        with self._connect() as conn:
            cursor = conn.execute("SELECT decision FROM decision_ledger WHERE entry_id = ?", (entry_id,))
            row = cursor.fetchone()
            if not row:
                return
            dec = row["decision"]
            if dec in ("NO_TRADE", "WAIT"):
                verdict = "CORRECT_ABSTENTION" if return_4h < 1.0 else "MISSED_OPPORTUNITY"
            else:
                verdict = "PROFITABLE_TRADE" if return_4h > 0 else "STOPPED_OUT"

            conn.execute(
                """
                UPDATE decision_ledger
                SET counterfactual_return_4h = ?, counterfactual_return_24h = ?, counterfactual_verdict = ?
                WHERE entry_id = ?
                """,
                (return_4h, return_24h, verdict, entry_id),
            )

    def get_entry(self, entry_id: str) -> DecisionLedgerEntry | None:
        with self._connect() as conn:
            cursor = conn.execute("SELECT * FROM decision_ledger WHERE entry_id = ?", (entry_id,))
            row = cursor.fetchone()
            if not row:
                return None
            return DecisionLedgerEntry(
                entry_id=row["entry_id"],
                timestamp_ms=row["timestamp_ms"],
                symbol=row["symbol"],
                timeframe=row["timeframe"],
                decision=row["decision"],
                model_version=row["model_version"],
                strategy_profile_version=row["strategy_profile_version"],
                risk_policy_version=row["risk_policy_version"],
                execution_policy_version=row["execution_policy_version"],
                reason_codes=json.loads(row["reason_codes"]),
                opportunity_snapshot=json.loads(row["opportunity_snapshot"]),
                plain_language_rationale=row["plain_language_rationale"],
                counterfactual_return_4h=row["counterfactual_return_4h"],
                counterfactual_return_24h=row["counterfactual_return_24h"],
                counterfactual_verdict=row["counterfactual_verdict"],
            )

    def query(
        self,
        symbol: str | None = None,
        decision: str | None = None,
        limit: int = 100,
    ) -> list[DecisionLedgerEntry]:
        query = "SELECT * FROM decision_ledger WHERE 1=1"
        params: list[Any] = []
        if symbol:
            query += " AND symbol = ?"
            params.append(symbol)
        if decision:
            query += " AND decision = ?"
            params.append(decision)
        query += " ORDER BY timestamp_ms DESC LIMIT ?"
        params.append(limit)

        with self._connect() as conn:
            cursor = conn.execute(query, params)
            rows = cursor.fetchall()
            return [
                DecisionLedgerEntry(
                    entry_id=r["entry_id"],
                    timestamp_ms=r["timestamp_ms"],
                    symbol=r["symbol"],
                    timeframe=r["timeframe"],
                    decision=r["decision"],
                    model_version=r["model_version"],
                    strategy_profile_version=r["strategy_profile_version"],
                    risk_policy_version=r["risk_policy_version"],
                    execution_policy_version=r["execution_policy_version"],
                    reason_codes=json.loads(r["reason_codes"]),
                    opportunity_snapshot=json.loads(r["opportunity_snapshot"]),
                    plain_language_rationale=r["plain_language_rationale"],
                    counterfactual_return_4h=r["counterfactual_return_4h"],
                    counterfactual_return_24h=r["counterfactual_return_24h"],
                    counterfactual_verdict=r["counterfactual_verdict"],
                )
                for r in rows
            ]
