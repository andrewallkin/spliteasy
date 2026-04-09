"""drop username column

Revision ID: 0003_drop_username
Revises: 0002_profile_invitations
Create Date: 2026-04-07
"""

from alembic import op
import sqlalchemy as sa


revision = "0003_drop_username"
down_revision = "0002_profile_invitations"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint("ck_users_username_nonempty", "users", type_="check")
    op.drop_column("users", "username")


def downgrade() -> None:
    op.add_column(
        "users",
        sa.Column("username", sa.String(length=120), nullable=True),
    )
    op.execute(
        "UPDATE users SET username = 'u' || left(replace(id::text, '-', ''), 31) "
        "WHERE username IS NULL OR trim(username) = ''"
    )
    op.alter_column("users", "username", existing_type=sa.String(length=120), nullable=False)
    op.create_check_constraint("ck_users_username_nonempty", "users", "length(trim(username)) > 0")
    op.create_index("ix_users_username", "users", ["username"], unique=True)
