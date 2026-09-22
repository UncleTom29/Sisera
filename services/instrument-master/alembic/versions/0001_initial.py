"""initial instrument master tables

Revision ID: 0001
Revises:
Create Date: 2026-09-22
"""
import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "canonical_assets",
        sa.Column("asset_id", sa.String(64), primary_key=True),
        sa.Column("symbol", sa.String(32), nullable=False, unique=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("asset_class", sa.String(32), nullable=True),
        sa.Column("chain", sa.String(32), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
    )

    op.create_table(
        "venue_instruments",
        sa.Column("venue_instrument_id", sa.String(64), primary_key=True),
        sa.Column(
            "canonical_asset_id",
            sa.String(64),
            sa.ForeignKey("canonical_assets.asset_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("venue", sa.String(32), nullable=False),
        sa.Column("venue_symbol", sa.String(64), nullable=False),
        sa.Column("instrument_type", sa.String(32), nullable=False),
        sa.Column("base_asset", sa.String(16), nullable=False),
        sa.Column("quote_asset", sa.String(16), nullable=False),
        sa.Column("settlement_asset", sa.String(16), nullable=False),
        sa.Column("contract_address", sa.String(128), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("tick_size", sa.Numeric(36, 18), nullable=False),
        sa.Column("lot_size", sa.Numeric(36, 18), nullable=False),
        sa.Column("price_precision", sa.Integer(), nullable=False),
        sa.Column("quantity_precision", sa.Integer(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
    )
    op.create_index("ix_venue_symbol", "venue_instruments", ["venue", "venue_symbol"], unique=True)
    op.create_index(
        "ix_venue_instruments_canonical_asset_id", "venue_instruments", ["canonical_asset_id"]
    )

    op.create_table(
        "instruments",
        sa.Column("instrument_id", sa.String(64), primary_key=True),
        sa.Column(
            "canonical_asset_id",
            sa.String(64),
            sa.ForeignKey("canonical_assets.asset_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("symbol", sa.String(64), nullable=False),
        sa.Column("display_symbol", sa.String(64), nullable=False),
        sa.Column("instrument_type", sa.String(32), nullable=False),
        sa.Column("base_asset", sa.String(16), nullable=False),
        sa.Column("quote_asset", sa.String(16), nullable=False),
        sa.Column("settlement_asset", sa.String(16), nullable=False),
        sa.Column("venue", sa.String(32), nullable=False),
        sa.Column("chain", sa.String(32), nullable=True),
        sa.Column("contract_address", sa.String(128), nullable=True),
        sa.Column("contract_multiplier", sa.Numeric(36, 18), nullable=False),
        sa.Column("tick_size", sa.Numeric(36, 18), nullable=False),
        sa.Column("lot_size", sa.Numeric(36, 18), nullable=False),
        sa.Column("min_order_size", sa.Numeric(36, 18), nullable=False),
        sa.Column("price_precision", sa.Integer(), nullable=False),
        sa.Column("quantity_precision", sa.Integer(), nullable=False),
        sa.Column("expiry", sa.DateTime(timezone=True), nullable=True),
        sa.Column("strike", sa.Numeric(36, 18), nullable=True),
        sa.Column("option_type", sa.String(8), nullable=True),
        sa.Column("funding_model", sa.String(16), nullable=False),
        sa.Column("margin_model", sa.String(16), nullable=False),
        sa.Column("trading_calendar", sa.String(32), nullable=True),
        sa.Column("oracle", sa.String(64), nullable=True),
        sa.Column("collateral_rules_json", sa.JSON(), nullable=True),
        sa.Column("jurisdiction_tags_json", sa.JSON(), nullable=True),
        sa.Column("status", sa.String(16), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_instruments_symbol", "instruments", ["symbol"])
    op.create_index("ix_instruments_canonical_asset_id", "instruments", ["canonical_asset_id"])


def downgrade() -> None:
    op.drop_table("instruments")
    op.drop_table("venue_instruments")
    op.drop_table("canonical_assets")
