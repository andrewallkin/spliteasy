"""receipt enriched fields — nickname on receipts, enriched columns on line_items

Revision ID: 0004_receipt_enriched_fields
Revises: 0003_drop_username
Create Date: 2026-04-08
"""

from alembic import op
import sqlalchemy as sa


revision = "0004_receipt_enriched_fields"
down_revision = "0003_drop_username"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # receipts: add nickname
    op.add_column("receipts", sa.Column("nickname", sa.String(255), nullable=True))

    # line_items: add enriched OCR fields
    op.add_column("line_items", sa.Column("quantity", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("line_items", sa.Column("price_per_unit", sa.Numeric(10, 2), nullable=True))
    op.add_column("line_items", sa.Column("line_subtotal", sa.Numeric(10, 2), nullable=True))
    op.add_column(
        "line_items",
        sa.Column("line_discount", sa.Numeric(10, 2), nullable=False, server_default="0"),
    )
    op.add_column("line_items", sa.Column("final_line_total", sa.Numeric(10, 2), nullable=True))
    op.add_column(
        "line_items",
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0"),
    )


def downgrade() -> None:
    op.drop_column("line_items", "confidence")
    op.drop_column("line_items", "final_line_total")
    op.drop_column("line_items", "line_discount")
    op.drop_column("line_items", "line_subtotal")
    op.drop_column("line_items", "price_per_unit")
    op.drop_column("line_items", "quantity")
    op.drop_column("receipts", "nickname")
