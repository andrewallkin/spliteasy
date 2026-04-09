"""user profile and invitations

Revision ID: 0002_profile_invitations
Revises: 0001_initial_schema
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa


revision = "0002_profile_invitations"
down_revision = "0001_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("users", sa.Column("email", sa.String(255), nullable=True))
    op.add_column("users", sa.Column("display_name", sa.String(120), nullable=True))
    op.add_column("users", sa.Column("profile_picture", sa.Text(), nullable=True))

    op.execute("UPDATE users SET display_name = username WHERE display_name IS NULL")

    op.alter_column("users", "display_name", nullable=False)

    op.create_index("ix_users_email", "users", ["email"], unique=True)

    op.add_column("group_invitations", sa.Column("invited_email", sa.String(255), nullable=True))
    op.add_column("group_invitations", sa.Column("join_code", sa.String(6), nullable=True))
    op.create_index("ix_group_invitations_join_code", "group_invitations", ["join_code"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_group_invitations_join_code", table_name="group_invitations")
    op.drop_column("group_invitations", "join_code")
    op.drop_column("group_invitations", "invited_email")

    op.drop_index("ix_users_email", table_name="users")
    op.drop_column("users", "profile_picture")
    op.drop_column("users", "display_name")
    op.drop_column("users", "email")
