"""add profile_picture to groups

Revision ID: 0007_group_profile_picture
Revises: 0006_receipt_image_blob
Create Date: 2026-04-11
"""

import sqlalchemy as sa

from alembic import op

revision = "0007_group_profile_picture"
down_revision = "0006_receipt_image_blob"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("groups", sa.Column("profile_picture", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("groups", "profile_picture")
