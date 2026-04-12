"""add image_gcs_path to receipts (phase 1: schema, keep image_data for backfill)

Revision ID: 0008_gcs_migration
Revises: 0007_group_profile_picture
Create Date: 2026-04-12
"""

import sqlalchemy as sa

from alembic import op

revision = "0008_gcs_migration"
down_revision = "0007_group_profile_picture"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add image_gcs_path as nullable — rows backfilled by migrate_images_to_gcs.py script.
    # image_data and image_mime_type are made nullable so the ORM can handle both old and new rows.
    # Run 0009_gcs_cleanup after the backfill script completes to drop them.
    op.add_column("receipts", sa.Column("image_gcs_path", sa.String(1024), nullable=True))
    op.alter_column("receipts", "image_data", nullable=True)
    op.alter_column("receipts", "image_mime_type", nullable=True)


def downgrade() -> None:
    op.alter_column("receipts", "image_mime_type", nullable=False)
    op.alter_column("receipts", "image_data", nullable=False)
    op.drop_column("receipts", "image_gcs_path")
