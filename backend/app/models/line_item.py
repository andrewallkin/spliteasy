import uuid
from datetime import datetime
from decimal import Decimal

from sqlalchemy import CheckConstraint, DateTime, Enum, ForeignKey, Numeric, String, UniqueConstraint, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column

from app.db.base import Base
from app.models.enums import ShareType


class LineItem(Base):
    __tablename__ = "line_items"
    __table_args__ = (
        CheckConstraint("amount > 0", name="ck_line_items_amount_positive"),
        CheckConstraint("length(trim(description)) > 0", name="ck_line_items_description_nonempty"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    receipt_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("receipts.id", ondelete="CASCADE"), nullable=True, index=True
    )
    group_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("groups.id", ondelete="CASCADE"), index=True
    )
    description: Mapped[str] = mapped_column(String(255))
    # amount mirrors final_line_total and is used by ItemAssignment.share_amount calculations
    amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    uncertain: Mapped[bool] = mapped_column(default=False)
    sort_order: Mapped[int] = mapped_column(default=0)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    # Enriched OCR fields
    quantity: Mapped[int] = mapped_column(default=1)
    price_per_unit: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    line_subtotal: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    line_discount: Mapped[Decimal] = mapped_column(Numeric(10, 2), default=Decimal("0"))
    final_line_total: Mapped[Decimal | None] = mapped_column(Numeric(10, 2), nullable=True)
    confidence: Mapped[float] = mapped_column(default=0.0)


class ItemAssignment(Base):
    __tablename__ = "item_assignments"
    __table_args__ = (
        UniqueConstraint("line_item_id", "user_id", name="uq_item_assignments_line_item_user"),
        CheckConstraint("share_amount > 0", name="ck_item_assignments_share_amount_positive"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    line_item_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("line_items.id", ondelete="CASCADE"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="RESTRICT"), index=True
    )
    share_type: Mapped[ShareType] = mapped_column(Enum(ShareType, name="share_type_enum"))
    share_amount: Mapped[Decimal] = mapped_column(Numeric(10, 2))
    percentage: Mapped[Decimal | None] = mapped_column(Numeric(5, 2), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
