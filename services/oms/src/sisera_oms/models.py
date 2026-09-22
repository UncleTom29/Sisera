"""SQLAlchemy ORM models for the OMS (ADR-006).

Persists the canonical order aggregate (`sisera_domain.order.Order`) and its lifecycle.
`client_order_id` is unique — the persistence layer enforces idempotency at the database.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sisera_db import ExactDecimal
from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class OrderRow(Base):
    __tablename__ = "orders"

    sisera_order_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    client_order_id: Mapped[str] = mapped_column(String(64), nullable=False, unique=True)
    instrument_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    order_type: Mapped[str] = mapped_column(String(16), nullable=False)
    quantity: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    quantity_asset: Mapped[str | None] = mapped_column(String(16), nullable=True)
    price: Mapped[object | None] = mapped_column(ExactDecimal(), nullable=True)
    stop_price: Mapped[object | None] = mapped_column(ExactDecimal(), nullable=True)
    time_in_force: Mapped[str] = mapped_column(String(16), nullable=False)
    reduce_only: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    state: Mapped[str] = mapped_column(String(24), nullable=False, index=True)
    venue_order_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    filled_quantity: Mapped[object] = mapped_column(ExactDecimal(), nullable=False, default=0)
    avg_fill_price: Mapped[object | None] = mapped_column(ExactDecimal(), nullable=True)
    fee_amount: Mapped[object | None] = mapped_column(ExactDecimal(), nullable=True)
    fee_asset: Mapped[str | None] = mapped_column(String(16), nullable=True)
    account_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    portfolio_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    user_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    strategy_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    agent_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    risk_decision_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    approval_decision_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    created_at_ms: Mapped[int] = mapped_column(nullable=False)
    updated_at_ms: Mapped[int] = mapped_column(nullable=False)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    lifecycle: Mapped[list[OrderLifecycleRow]] = relationship(
        back_populates="order",
        cascade="all, delete-orphan",
        order_by="OrderLifecycleRow.id",
    )


class OrderLifecycleRow(Base):
    __tablename__ = "order_lifecycle"
    __table_args__ = (Index("ix_lifecycle_order_id", "order_id"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    order_id: Mapped[str] = mapped_column(
        ForeignKey("orders.sisera_order_id", ondelete="CASCADE"), nullable=False
    )
    from_state: Mapped[str] = mapped_column(String(24), nullable=False)
    to_state: Mapped[str] = mapped_column(String(24), nullable=False)
    timestamp_ms: Mapped[int] = mapped_column(nullable=False)
    note: Mapped[str | None] = mapped_column(String(255), nullable=True)

    order: Mapped[OrderRow] = relationship(back_populates="lifecycle")
