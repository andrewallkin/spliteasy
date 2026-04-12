"""rename profile_picture to image_gcs_path on users and groups tables

Revision ID: 0010_rename_profile_picture_to_image_gcs_path
Revises: 0009_gcs_cleanup
Create Date: 2026-04-12
"""

from alembic import op

revision = "0010_rename_profile_picture_to_image_gcs_path"
down_revision = "0009_gcs_cleanup"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column("users", "profile_picture", new_column_name="image_gcs_path")
    op.alter_column("groups", "profile_picture", new_column_name="image_gcs_path")


def downgrade() -> None:
    op.alter_column("users", "image_gcs_path", new_column_name="profile_picture")
    op.alter_column("groups", "image_gcs_path", new_column_name="profile_picture")
