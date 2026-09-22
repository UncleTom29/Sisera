"""SQLAlchemy ORM model for the Decision Ledger (spec §18).

Provenance store, distinct from the *financial* ledger (ADR-007). Stores structured
decision metadata (versions, features, signal components, plans, fills, outcome,
counterfactual, attribution) as JSON alongside the scalar query columns.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sisera_db import ExactDecimal
from sqlalchemy import JSON, DateTime, Index, String
from sqlalchemy.orm import Mapped, mapped_column

from sisera_ledger.models import Base


class DecisionRow(Base):
    __tablename__ = "decision_ledger"
    __table_args__ = (
        Index("ix_decision_symbol", "symbol"),
        Index("ix_decision_kind", "kind"),
        Index("ix_decision_timestamp", "timestamp_ms"),
    )

    decision_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    timestamp_ms: Mapped[int] = mapped_column(nullable=False)
    instrument_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    symbol: Mapped[str | None] = mapped_column(String(32), nullable=True)
    direction: Mapped[str | None] = mapped_column(String(8), nullable=True)
    kind: Mapped[str] = mapped_column(String(16), nullable=False)
    market_snapshot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    portfolio_snapshot_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    strategy_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    model_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    risk_policy_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    execution_policy_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    confidence: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    expected_value: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    uncertainty: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    regime: Mapped[str | None] = mapped_column(String(32), nullable=True)
    features_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    signal_components_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    reason_codes_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    trade_plan_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    risk_result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    approval_result_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    route_plan_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    fills_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    outcome: Mapped[str | None] = mapped_column(String(32), nullable=True)
    counterfactual: Mapped[str | None] = mapped_column(String(32), nullable=True)
    attribution_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
