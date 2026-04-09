import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import SplitType


class ManualEntry(Base):
    __tablename__ = "manual_entries"
    __table_args__ = (
        CheckConstraint("length(trim(description)) > 0", name="ck_manual_entries_description_nonempty"),
        CheckConstraint("total_amount > 0", name="ck_manual_entries_total_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    description: Mapped[str] = mapped_column(String(255))
    total_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    split_type: Mapped[SplitType] = mapped_column(Enum(SplitType, name="split_type_enum"))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class ManualEntrySplit(Base):
    __tablename__ = "manual_entry_splits"
    __table_args__ = (
        UniqueConstraint("manual_entry_id", "user_id", name="uq_manual_entry_splits_entry_user"),
        CheckConstraint("amount > 0", name="ck_manual_entry_splits_amount_positive"),
        CheckConstraint(
            "percentage IS NULL OR (percentage >= 0 AND percentage <= 100)",
            name="ck_manual_entry_splits_percentage_range",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    manual_entry_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("manual_entries.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Settlement(Base):
    __tablename__ = "settlements"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_settlements_amount_positive"),
        CheckConstraint("paid_by <> paid_to", name="ck_settlements_paid_by_not_paid_to"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    paid_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    paid_to: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    notes: Mapped[str | None] = mapped_column(String(255), nullable=True)
    settled_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
