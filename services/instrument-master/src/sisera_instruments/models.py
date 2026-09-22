"""SQLAlchemy ORM models for the Instrument Master (ADR-005)."""

from __future__ import annotations

from datetime import UTC, datetime

from sisera_db import ExactDecimal
from sqlalchemy import JSON, DateTime, ForeignKey, Index, String
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    pass


class CanonicalAssetRow(Base):
    __tablename__ = "canonical_assets"

    asset_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    symbol: Mapped[str] = mapped_column(String(32), nullable=False, unique=True)
    name: Mapped[str] = mapped_column(String(128), nullable=False)
    asset_class: Mapped[str | None] = mapped_column(String(32), nullable=True)
    chain: Mapped[str | None] = mapped_column(String(32), nullable=True)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class VenueInstrumentRow(Base):
    __tablename__ = "venue_instruments"
    __table_args__ = (Index("ix_venue_symbol", "venue", "venue_symbol", unique=True),)

    venue_instrument_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    canonical_asset_id: Mapped[str] = mapped_column(
        ForeignKey("canonical_assets.asset_id", ondelete="CASCADE"), nullable=False, index=True
    )
    venue: Mapped[str] = mapped_column(String(32), nullable=False)
    venue_symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    instrument_type: Mapped[str] = mapped_column(String(32), nullable=False)
    base_asset: Mapped[str] = mapped_column(String(16), nullable=False)
    quote_asset: Mapped[str] = mapped_column(String(16), nullable=False)
    settlement_asset: Mapped[str] = mapped_column(String(16), nullable=False)
    contract_address: Mapped[str | None] = mapped_column(String(128), nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    tick_size: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    lot_size: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    price_precision: Mapped[int] = mapped_column(nullable=False, default=2)
    quantity_precision: Mapped[int] = mapped_column(nullable=False, default=0)
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)


class InstrumentRow(Base):
    __tablename__ = "instruments"

    instrument_id: Mapped[str] = mapped_column(String(64), primary_key=True)
    canonical_asset_id: Mapped[str] = mapped_column(
        ForeignKey("canonical_assets.asset_id", ondelete="CASCADE"), nullable=False, index=True
    )
    symbol: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    display_symbol: Mapped[str] = mapped_column(String(64), nullable=False)
    instrument_type: Mapped[str] = mapped_column(String(32), nullable=False)
    base_asset: Mapped[str] = mapped_column(String(16), nullable=False)
    quote_asset: Mapped[str] = mapped_column(String(16), nullable=False)
    settlement_asset: Mapped[str] = mapped_column(String(16), nullable=False)
    venue: Mapped[str] = mapped_column(String(32), nullable=False)
    chain: Mapped[str | None] = mapped_column(String(32), nullable=True)
    contract_address: Mapped[str | None] = mapped_column(String(128), nullable=True)
    contract_multiplier: Mapped[object] = mapped_column(ExactDecimal(), nullable=False, default=1)
    tick_size: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    lot_size: Mapped[object] = mapped_column(ExactDecimal(), nullable=False)
    min_order_size: Mapped[object] = mapped_column(ExactDecimal(), nullable=False, default=0)
    price_precision: Mapped[int] = mapped_column(nullable=False, default=2)
    quantity_precision: Mapped[int] = mapped_column(nullable=False, default=0)
    expiry: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    strike: Mapped[object | None] = mapped_column(ExactDecimal(), nullable=True)
    option_type: Mapped[str | None] = mapped_column(String(8), nullable=True)
    funding_model: Mapped[str] = mapped_column(String(16), nullable=False, default="NONE")
    margin_model: Mapped[str] = mapped_column(String(16), nullable=False, default="NONE")
    trading_calendar: Mapped[str | None] = mapped_column(String(32), nullable=True)
    oracle: Mapped[str | None] = mapped_column(String(64), nullable=True)
    collateral_rules_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    jurisdiction_tags_json: Mapped[list | None] = mapped_column(JSON, nullable=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False, default="ACTIVE")
    metadata_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(UTC),
        nullable=False,
    )
