"""initial ledger tables

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
        "ledger_entries",
        sa.Column("entry_id", sa.String(64), primary_key=True),
        sa.Column("entry_type", sa.String(32), nullable=False),
        sa.Column("timestamp_ms", sa.BigInteger(), nullable=False),
        sa.Column("reference_id", sa.String(128), nullable=True),
        sa.Column("metadata_json", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )
    op.create_index("ix_ledger_entries_timestamp_ms", "ledger_entries", ["timestamp_ms"])

    op.create_table(
        "ledger_postings",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "entry_id",
            sa.String(64),
            sa.ForeignKey("ledger_entries.entry_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("account", sa.String(64), nullable=False),
        sa.Column("asset", sa.String(16), nullable=False),
        sa.Column("amount", sa.Numeric(36, 18), nullable=False),
    )
    op.create_index("ix_posting_account_asset", "ledger_postings", ["account", "asset"])


def downgrade() -> None:
    op.drop_table("ledger_postings")
    op.drop_table("ledger_entries")
