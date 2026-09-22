"""SQLAlchemy ORM models for auth (spec §33)."""

from __future__ import annotations

from datetime import UTC, datetime

from sqlalchemy import DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class OrganizationRow(Base):
    __tablename__ = "organizations"

    org_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )


class DeskRow(Base):
    __tablename__ = "desks"

    desk_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    org_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.org_id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(128), nullable=False)


class UserRow(Base):
    __tablename__ = "users"

    user_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True)
    name: Mapped[str | None] = mapped_column(String(128), nullable=True)


class MembershipRow(Base):
    __tablename__ = "memberships"
    __table_args__ = (
        UniqueConstraint("user_id", "org_id", "desk_id", name="uq_membership_scope"),
        Index("ix_membership_user_org", "user_id", "org_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.user_id", ondelete="CASCADE"), nullable=False
    )
    org_id: Mapped[str] = mapped_column(
        ForeignKey("organizations.org_id", ondelete="CASCADE"), nullable=False
    )
    desk_id: Mapped[str | None] = mapped_column(
        ForeignKey("desks.desk_id", ondelete="CASCADE"), nullable=True
    )
    portfolio_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    role: Mapped[str] = mapped_column(String(32), nullable=False)
