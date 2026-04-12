"""drop image_data and image_mime_type from receipts after gcs backfill complete

Revision ID: 0009_gcs_cleanup
Revises: 0008_gcs_migration
Create Date: 2026-04-12

Run this migration ONLY after migrate_images_to_gcs.py has finished backfilling all rows.
"""

import sqlalchemy as sa
from sqlalchemy import text

from alembic import op

revision = "0009_gcs_cleanup"
down_revision = "0008_gcs_migration"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Fail fast if any receipts have not been backfilled yet.
    conn = op.get_bind()
    result = conn.execute(
        text("SELECT COUNT(*) FROM receipts WHERE image_gcs_path IS NULL OR image_gcs_path = ''")
    )
    unbackfilled = result.scalar()
    if unbackfilled:
        raise RuntimeError(
            f"{unbackfilled} receipt(s) still have no image_gcs_path. "
            "Run migrate_images_to_gcs.py before applying this migration."
        )

    op.alter_column("receipts", "image_gcs_path", nullable=False)
    op.drop_constraint("ck_receipts_image_mime_type_nonempty", "receipts", type_="check")
    op.drop_column("receipts", "image_data")
    op.drop_column("receipts", "image_mime_type")


def downgrade() -> None:
    op.add_column("receipts", sa.Column("image_mime_type", sa.String(64), nullable=True, server_default="image/jpeg"))
    op.add_column("receipts", sa.Column("image_data", sa.LargeBinary(), nullable=True))
    op.create_check_constraint(
        "ck_receipts_image_mime_type_nonempty",
        "receipts",
        "length(trim(image_mime_type)) > 0",
    )
    op.alter_column("receipts", "image_gcs_path", nullable=True)
