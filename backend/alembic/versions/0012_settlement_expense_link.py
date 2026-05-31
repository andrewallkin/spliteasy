"""link settlements to manual entries or receipts for mark-as-paid

Revision ID: 0012_settlement_expense_link
Revises: 0011_receipt_image_gcs_paths
Create Date: 2026-05-31
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0012_settlement_expense_link"
down_revision = "0011_receipt_image_gcs_paths"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "settlements",
        sa.Column(
            "manual_entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("manual_entries.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.add_column(
        "settlements",
        sa.Column(
            "receipt_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("receipts.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_check_constraint(
        "ck_settlements_single_expense_link",
        "settlements",
        "NOT (manual_entry_id IS NOT NULL AND receipt_id IS NOT NULL)",
    )
    op.create_index(
        "ix_settlements_manual_entry_paid_by",
        "settlements",
        ["manual_entry_id", "paid_by"],
        unique=True,
        postgresql_where=sa.text("manual_entry_id IS NOT NULL"),
    )
    op.create_index(
        "ix_settlements_receipt_paid_by",
        "settlements",
        ["receipt_id", "paid_by"],
        unique=True,
        postgresql_where=sa.text("receipt_id IS NOT NULL"),
    )


def downgrade() -> None:
    op.drop_index("ix_settlements_receipt_paid_by", table_name="settlements")
    op.drop_index("ix_settlements_manual_entry_paid_by", table_name="settlements")
    op.drop_constraint("ck_settlements_single_expense_link", "settlements", type_="check")
    op.drop_column("settlements", "receipt_id")
    op.drop_column("settlements", "manual_entry_id")
