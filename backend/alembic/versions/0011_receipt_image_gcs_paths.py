"""add image_gcs_paths JSON column to receipts for multi-page uploads

Revision ID: 0011_receipt_image_gcs_paths
Revises: 0010_rename_pfp_image_gcs
Create Date: 2026-04-16
"""

import sqlalchemy as sa
from alembic import op

revision = "0011_receipt_image_gcs_paths"
down_revision = "0010_rename_pfp_image_gcs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("receipts", sa.Column("image_gcs_paths", sa.JSON(), nullable=True))


def downgrade() -> None:
    op.drop_column("receipts", "image_gcs_paths")
