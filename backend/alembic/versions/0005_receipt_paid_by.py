"""receipt paid_by_user_id

Revision ID: 0005_receipt_paid_by
Revises: 0004_receipt_enriched_fields
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0005_receipt_paid_by"
down_revision = "0004_receipt_enriched_fields"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "receipts",
        sa.Column(
            "paid_by_user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("receipts", "paid_by_user_id")
