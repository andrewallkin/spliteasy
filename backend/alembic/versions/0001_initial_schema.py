"""initial schema

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-04-05
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


# create_type=False: types are created explicitly below; avoids duplicate CREATE TYPE on create_table.
group_role_enum = postgresql.ENUM("owner", "member", name="group_role_enum", create_type=False)
receipt_status_enum = postgresql.ENUM(
    "pending_ocr",
    "pending_review",
    "confirmed",
    "assigned",
    "ocr_failed",
    name="receipt_status_enum",
    create_type=False,
)
share_type_enum = postgresql.ENUM(
    "full", "equal", "percentage", name="share_type_enum", create_type=False
)
split_type_enum = postgresql.ENUM(
    "equal", "full", "percentage", name="split_type_enum", create_type=False
)


def upgrade() -> None:
    group_role_enum.create(op.get_bind(), checkfirst=True)
    receipt_status_enum.create(op.get_bind(), checkfirst=True)
    share_type_enum.create(op.get_bind(), checkfirst=True)
    split_type_enum.create(op.get_bind(), checkfirst=True)

    op.create_table(
        "users",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("username", sa.String(length=120), nullable=False, unique=True),
        sa.Column("hashed_password", sa.String(length=255), nullable=False),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("length(trim(username)) > 0", name="ck_users_username_nonempty"),
    )
    op.create_index("ix_users_username", "users", ["username"])

    op.create_table(
        "groups",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("length(trim(name)) > 0", name="ck_groups_name_nonempty"),
    )

    op.create_table(
        "group_members",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "invited_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("role", group_role_enum, nullable=False),
        sa.Column("joined_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint("group_id", "user_id", name="uq_group_members_group_user"),
    )
    op.create_index("ix_group_members_group_id", "group_members", ["group_id"])
    op.create_index("ix_group_members_user_id", "group_members", ["user_id"])

    op.create_table(
        "group_invitations",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("invited_by", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("accepted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "refresh_tokens",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("family_id", postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column("is_used", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("is_revoked", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("expires_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        "receipts",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "uploaded_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("image_path", sa.String(length=1024), nullable=False),
        sa.Column("merchant_name", sa.String(length=255)),
        sa.Column("receipt_date", sa.String(length=40)),
        sa.Column("currency", sa.String(length=12)),
        sa.Column("total_amount", sa.Numeric(10, 2)),
        sa.Column("status", receipt_status_enum, nullable=False),
        sa.Column("ocr_raw_response", sa.JSON()),
        sa.Column("ocr_error", sa.String(length=400)),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("length(trim(image_path)) > 0", name="ck_receipts_image_path_nonempty"),
    )
    op.create_index("ix_receipts_group_id", "receipts", ["group_id"])
    op.create_index("ix_receipts_status", "receipts", ["status"])

    op.create_table(
        "line_items",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "receipt_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("receipts.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("uncertain", sa.Boolean(), nullable=False, server_default=sa.false()),
        sa.Column("sort_order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("amount > 0", name="ck_line_items_amount_positive"),
        sa.CheckConstraint("length(trim(description)) > 0", name="ck_line_items_description_nonempty"),
    )

    op.create_table(
        "item_assignments",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "line_item_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("line_items.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("share_type", share_type_enum, nullable=False),
        sa.Column("share_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("percentage", sa.Numeric(5, 2)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("share_amount > 0", name="ck_item_assignments_share_amount_positive"),
        sa.UniqueConstraint("line_item_id", "user_id", name="uq_item_assignments_line_item_user"),
    )

    op.create_table(
        "manual_entries",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "created_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("description", sa.String(length=255), nullable=False),
        sa.Column("total_amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("split_type", split_type_enum, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("total_amount > 0", name="ck_manual_entries_total_amount_positive"),
        sa.CheckConstraint("length(trim(description)) > 0", name="ck_manual_entries_description_nonempty"),
    )

    op.create_table(
        "manual_entry_splits",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "manual_entry_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("manual_entries.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("percentage", sa.Numeric(5, 2)),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("amount > 0", name="ck_manual_entry_splits_amount_positive"),
        sa.CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_manual_entry_splits_percentage_range",
        ),
        sa.UniqueConstraint("manual_entry_id", "user_id", name="uq_manual_entry_splits_entry_user"),
    )

    op.create_table(
        "settlements",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "paid_by",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "paid_to",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("amount", sa.Numeric(10, 2), nullable=False),
        sa.Column("notes", sa.String(length=255)),
        sa.Column("settled_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.CheckConstraint("amount > 0", name="ck_settlements_amount_positive"),
        sa.CheckConstraint("paid_by <> paid_to", name="ck_settlements_paid_by_not_paid_to"),
    )

    op.create_table(
        "group_balances",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column(
            "group_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("groups.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey("users.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("net_amount", sa.Numeric(10, 2), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )
    op.create_index("ix_group_balances_group_user", "group_balances", ["group_id", "user_id"], unique=True)


def downgrade() -> None:
    op.drop_index("ix_group_balances_group_user", table_name="group_balances")
    op.drop_table("group_balances")
    op.drop_table("settlements")
    op.drop_table("manual_entry_splits")
    op.drop_table("manual_entries")
    op.drop_table("item_assignments")
    op.drop_table("line_items")
    op.drop_index("ix_receipts_status", table_name="receipts")
    op.drop_index("ix_receipts_group_id", table_name="receipts")
    op.drop_table("receipts")
    op.drop_table("refresh_tokens")
    op.drop_table("group_invitations")
    op.drop_index("ix_group_members_user_id", table_name="group_members")
    op.drop_index("ix_group_members_group_id", table_name="group_members")
    op.drop_table("group_members")
    op.drop_table("groups")
    op.drop_index("ix_users_username", table_name="users")
    op.drop_table("users")

    split_type_enum.drop(op.get_bind(), checkfirst=True)
    share_type_enum.drop(op.get_bind(), checkfirst=True)
    receipt_status_enum.drop(op.get_bind(), checkfirst=True)
    group_role_enum.drop(op.get_bind(), checkfirst=True)
