"""store receipt images in db

Revision ID: 0006_receipt_image_blob
Revises: 0005_receipt_paid_by
Create Date: 2026-04-10
"""

import sqlalchemy as sa

from alembic import op

revision = "0006_receipt_image_blob"
down_revision = "0005_receipt_paid_by"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("receipts", sa.Column("image_data", sa.LargeBinary(), nullable=False))
    op.add_column(
        "receipts",
        sa.Column(
            "image_mime_type",
            sa.String(length=64),
            nullable=False,
            server_default="image/jpeg",
        ),
    )
    op.create_check_constraint(
        "ck_receipts_image_mime_type_nonempty", "receipts", "length(trim(image_mime_type)) > 0"
    )
    op.drop_constraint("ck_receipts_image_path_nonempty", "receipts", type_="check")
    op.drop_column("receipts", "image_path")


def downgrade() -> None:
    op.add_column(
        "receipts",
        sa.Column(
            "image_path",
            sa.String(length=1024),
            nullable=False,
            server_default="legacy.jpg",
        ),
    )
    op.create_check_constraint(
        "ck_receipts_image_path_nonempty", "receipts", "length(trim(image_path)) > 0"
    )
    op.drop_constraint("ck_receipts_image_mime_type_nonempty", "receipts", type_="check")
    op.drop_column("receipts", "image_mime_type")
    op.drop_column("receipts", "image_data")
