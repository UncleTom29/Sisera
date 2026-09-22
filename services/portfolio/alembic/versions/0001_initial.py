"""initial portfolio tables

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
        "portfolios",
        sa.Column("portfolio_id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column(
            "parent_id",
            sa.String(64),
            sa.ForeignKey("portfolios.portfolio_id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("quote_asset", sa.String(16), nullable=False),
        sa.Column("peak_equity", sa.Numeric(36, 18), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "portfolio_cash",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "portfolio_id",
            sa.String(64),
            sa.ForeignKey("portfolios.portfolio_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("asset", sa.String(16), nullable=False),
        sa.Column("amount", sa.Numeric(36, 18), nullable=False),
        sa.UniqueConstraint("portfolio_id", "asset", name="uq_cash_portfolio_asset"),
    )

    op.create_table(
        "positions",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "portfolio_id",
            sa.String(64),
            sa.ForeignKey("portfolios.portfolio_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("instrument_id", sa.String(64), nullable=False),
        sa.Column("side", sa.String(8), nullable=False),
        sa.Column("quantity", sa.Numeric(36, 18), nullable=False),
        sa.Column("entry_price", sa.Numeric(36, 18), nullable=False),
        sa.Column("mark_price", sa.Numeric(36, 18), nullable=False),
        sa.Column("margin_amount", sa.Numeric(36, 18), nullable=True),
        sa.Column("margin_asset", sa.String(16), nullable=True),
        sa.Column("leverage", sa.Numeric(36, 18), nullable=False),
        sa.Column("quote_asset", sa.String(16), nullable=True),
        sa.Column("beta_map_json", sa.JSON(), nullable=True),
        sa.UniqueConstraint("portfolio_id", "instrument_id", name="uq_position_portfolio_instrument"),
    )
    op.create_index("ix_positions_instrument", "positions", ["instrument_id"])


def downgrade() -> None:
    op.drop_table("positions")
    op.drop_table("portfolio_cash")
    op.drop_table("portfolios")
