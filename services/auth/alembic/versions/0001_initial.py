"""initial auth tables

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
        "organizations",
        sa.Column("org_id", sa.String(64), primary_key=True),
        sa.Column("name", sa.String(128), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
    )

    op.create_table(
        "desks",
        sa.Column("desk_id", sa.String(64), primary_key=True),
        sa.Column(
            "org_id",
            sa.String(64),
            sa.ForeignKey("organizations.org_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("name", sa.String(128), nullable=False),
    )
    op.create_index("ix_desks_org_id", "desks", ["org_id"])

    op.create_table(
        "users",
        sa.Column("user_id", sa.String(64), primary_key=True),
        sa.Column("email", sa.String(255), nullable=False, unique=True),
        sa.Column("name", sa.String(128), nullable=True),
    )

    op.create_table(
        "memberships",
        sa.Column("id", sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column(
            "user_id",
            sa.String(64),
            sa.ForeignKey("users.user_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "org_id",
            sa.String(64),
            sa.ForeignKey("organizations.org_id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "desk_id",
            sa.String(64),
            sa.ForeignKey("desks.desk_id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("portfolio_id", sa.String(64), nullable=True),
        sa.Column("role", sa.String(32), nullable=False),
        sa.UniqueConstraint("user_id", "org_id", "desk_id", name="uq_membership_scope"),
    )
    op.create_index("ix_membership_user_org", "memberships", ["user_id", "org_id"])


def downgrade() -> None:
    op.drop_table("memberships")
    op.drop_table("users")
    op.drop_table("desks")
    op.drop_table("organizations")
