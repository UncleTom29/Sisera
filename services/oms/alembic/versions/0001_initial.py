"""initial oms tables

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
        "orders",
        sa.Column("sisera_order_id", sa.String(64), primary_key=True),
        sa.Column("client_order_id", sa.String(64), nullable=False, unique=True),
        sa.Column("instrument_id", sa.String(64), nullable=False),
        sa.Column("side", sa.String(8), nullable=False),
        sa.Column("order_type", sa.String(16), nullable=False),
        sa.Column("quantity", sa.Numeric(36, 18), nullable=False),
        sa.Column("quantity_asset", sa.String(16), nullable=True),
        sa.Column("price", sa.Numeric(36, 18), nullable=True),
        sa.Column("stop_price", sa.Numeric(36, 18), nullable=True),
        sa.Column("time_in_force", sa.String(16), nullable=False),
        sa.Column("reduce_only", sa.Boolean(), nullable=False),
        sa.Column("state", sa.String(24), nullable=False),
        sa.Column("venue_order_id", sa.String(64), nullable=True),
        sa.Column("filled_quantity", sa.Numeric(36, 18), nullable=False),
        sa.Column("avg_fill_price", sa.Numeric(36, 18), nullable=True),
        sa.Column("fee_amount", sa.Numeric(36, 18), nullable=True),
        sa.Column("fee_asset", sa.String(16), nullable=True),
        sa.Column("account_id", sa.String(64), nullable=False),
        sa.Column("portfolio_id", sa.String(64), nullable=False),
        sa.Column("user_id", sa.String(64), nullable=True),
        sa.Column("strategy_id", sa.String(64), nullable=True),
        sa.Column("agent_id", sa.String(64), nullable=True),
        sa.Column("risk_decision_id", sa.String(64), nullable=True),
        sa.Column("approval_decision_id", sa.String(64), nullable=True),
        sa.Column("created_at_ms", sa.BigInteger(), nullable=False),
        sa.Column("updated_at_ms", sa.BigInteger(), nullable=False),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_orders_instrument_id", "orders", ["instrument_id"])
    op.create_index("ix_orders_state", "orders", ["state"])
    op.create_index("ix_orders_account_id", "orders", ["account_id"])
    op.create_index("ix_orders_portfolio_id", "orders", ["portfolio_id"])

    op.create_table(
        "order_lifecycle",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "order_id",
            sa.String(64),
            sa.ForeignKey("orders.sisera_order_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("from_state", sa.String(24), nullable=False),
        sa.Column("to_state", sa.String(24), nullable=False),
        sa.Column("timestamp_ms", sa.BigInteger(), nullable=False),
        sa.Column("note", sa.String(255), nullable=True),
    )
    op.create_index("ix_lifecycle_order_id", "order_lifecycle", ["order_id"])


def downgrade() -> None:
    op.drop_table("order_lifecycle")
    op.drop_table("orders")
