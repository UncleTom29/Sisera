"""SQLAlchemy ORM models for portfolios and positions (spec §15)."""

from __future__ import annotations

from datetime import UTC, datetime

from sisera_db import ExactDecimal
from sqlalchemy import JSON, DateTime, ForeignKey, Index, String, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


class PortfolioRow(Base):
    __tablename__ = "portfolios"

    portfolio_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    parent_id: Mapped[str | None] = mapped_column(
        ForeignKey("portfolios.portfolio_id", ondelete="SET NULL"), nullable=True
    )
    quote_asset: Mapped[str] = mapped_column(String(16), nullable=False)
    peak_equity: Mapped[object] = mapped_column(ExactDecimal(), nullable=False, default=0)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(UTC), nullable=False
    )

    cash: Mapped[list[PortfolioCashRow]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )
    positions: Mapped[list[PositionRow]] = relationship(
        back_populates="portfolio", cascade="all, delete-orphan"
    )


class PortfolioCashRow(Base):
    __tablename__ = "portfolio_cash"
    __table_args__ = (UniqueConstraint("portfolio_id", "asset", name="uq_cash_portfolio_asset"),)

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    portfolio_id: Mapped[str] = mapped_column(
        ForeignKey("portfolios.portfolio_id", ondelete="CASCADE"), nullable=False
    )
    asset: Mapped[str] = mapped_column(String(16), nullable=False)
    amount: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)

    portfolio: Mapped[PortfolioRow] = relationship(back_populates="cash")


class PositionRow(Base):
    __tablename__ = "positions"
    __table_args__ = (
        UniqueConstraint("portfolio_id", "instrument_id", name="uq_position_portfolio_instrument"),
        Index("ix_positions_instrument", "instrument_id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True, autoincrement=True)
    portfolio_id: Mapped[str] = mapped_column(
        ForeignKey("portfolios.portfolio_id", ondelete="CASCADE"), nullable=False
    )
    instrument_id: Mapped[str] = mapped_column(String(64), nullable=False)
    side: Mapped[str] = mapped_column(String(8), nullable=False)
    quantity: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    entry_price: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    mark_price: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    margin_amount: Mapped[object | None] = mapped_column(ExactDecimal(), nullable=True)
    margin_asset: Mapped[str | None] = mapped_column(String(16), nullable=True)
    leverage: Mapped[object] = mapped_column(ExactDecimal(), nullable=False, default=1)
    quote_asset: Mapped[str | None] = mapped_column(String(16), nullable=True)
    beta_map_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)

    portfolio: Mapped[PortfolioRow] = relationship(back_populates="positions")
