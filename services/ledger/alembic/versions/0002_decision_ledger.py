"""decision ledger

Revision ID: 0002
Revises: 0001
Create Date: 2026-09-22
"""
import sqlalchemy as sa
from alembic import op

revision = "0002"
down_revision = "0001"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "decision_ledger",
        sa.Column("decision_id", sa.String(64), primary_key=True),
        sa.Column("timestamp_ms", sa.BigInteger(), nullable=False),
        sa.Column("instrument_id", sa.String(64), nullable=True),
        sa.Column("symbol", sa.String(32), nullable=True),
        sa.Column("direction", sa.String(8), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("market_snapshot_id", sa.String(64), nullable=True),
        sa.Column("portfolio_snapshot_id", sa.String(64), nullable=True),
        sa.Column("strategy_version", sa.String(32), nullable=True),
        sa.Column("model_version", sa.String(32), nullable=True),
        sa.Column("risk_policy_version", sa.String(32), nullable=True),
        sa.Column("execution_policy_version", sa.String(32), nullable=True),
        sa.Column("confidence", sa.Numeric(36, 18), nullable=False),
        sa.Column("expected_value", sa.Numeric(36, 18), nullable=False),
        sa.Column("uncertainty", sa.Numeric(36, 18), nullable=False),
        sa.Column("regime", sa.String(32), nullable=True),
        sa.Column("features_json", sa.JSON(), nullable=True),
        sa.Column("signal_components_json", sa.JSON(), nullable=True),
        sa.Column("reason_codes_json", sa.JSON(), nullable=True),
        sa.Column("trade_plan_json", sa.JSON(), nullable=True),
        sa.Column("risk_result_json", sa.JSON(), nullable=True),
        sa.Column("approval_result_json", sa.JSON(), nullable=True),
        sa.Column("route_plan_json", sa.JSON(), nullable=True),
        sa.Column("fills_json", sa.JSON(), nullable=True),
        sa.Column("outcome", sa.String(32), nullable=True),
        sa.Column("counterfactual", sa.String(32), nullable=True),
        sa.Column("attribution_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_decision_symbol", "decision_ledger", ["symbol"])
    op.create_index("ix_decision_kind", "decision_ledger", ["kind"])
    op.create_index("ix_decision_timestamp", "decision_ledger", ["timestamp_ms"])


def downgrade() -> None:
    op.drop_table("decision_ledger")
