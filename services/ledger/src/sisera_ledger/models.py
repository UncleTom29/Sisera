"""SQLAlchemy ORM models for the double-entry financial ledger (ADR-007).

These are the *persistence* representation of the canonical domain objects in
`sisera_domain.ledger`. Amounts are stored as NUMERIC (Decimal); nothing is ever stored as
binary float. Posting rows are immutable once written; corrections are compensating entries.
"""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import (
    JSON,
    DateTime,
    ForeignKey,
    Index,
    String,
)
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship

from sisera_ledger.types import ExactDecimal


class Base(DeclarativeBase):
    pass


class LedgerEntryRow(Base):
    __tablename__ = "ledger_entries"

    entry_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    entry_type: Mapped[str] = mapped_column(String(32), nullable=False)
    timestamp_ms: Mapped[int] = mapped_column(nullable=False, index=True)
    reference_id: Mapped[str | None] = mapped_column(String(128), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )

    postings: Mapped[list[PostingRow]] = relationship(
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="PostingRow.id",
    )


class PostingRow(Base):
    __tablename__ = "ledger_postings"
    __table_args__ = (
        Index("ix_posting_account_asset", "account", "asset"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    entry_id: Mapped[str] = mapped_column(
        ForeignKey("ledger_entries.entry_id", ondelete="CASCADE"),
        nullable=False,
    )
    account: Mapped[str] = mapped_column(String(64), nullable=False)
    asset: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)

    entry: Mapped[LedgerEntryRow] = relationship(back_populates="postings")
