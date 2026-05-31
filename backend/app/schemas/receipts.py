import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field


class ReceiptLineItemIn(BaseModel):
    description: str
    amount: Decimal  # kept for backwards compat; treated as final_line_total when final_line_total absent
    quantity: int = 1
    price_per_unit: Decimal | None = None
    line_subtotal: Decimal | None = None
    line_discount: Decimal = Decimal("0")
    final_line_total: Decimal | None = None


class ReceiptUpdateItemsRequest(BaseModel):
    items: list[ReceiptLineItemIn]


class ShareAssignment(BaseModel):
    user_id: uuid.UUID
    share_type: str


class LineItemAssignmentIn(BaseModel):
    line_item_id: uuid.UUID
    shares: list[ShareAssignment]


class ReceiptAssignRequest(BaseModel):
    paid_by: uuid.UUID
    assignments: list[LineItemAssignmentIn]


class ReceiptOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    uploaded_by: uuid.UUID
    nickname: str | None = None
    merchant_name: str | None = None
    total_amount: Decimal | None = None
    currency: str | None = None
    paid_by_user_id: uuid.UUID | None = None
    status: str
    created_at: datetime
    image_count: int = 0

    class Config:
        from_attributes = True


class OCRLineItemOut(BaseModel):
    id: uuid.UUID
    description: str
    amount: Decimal = Field(..., decimal_places=2)
    uncertain: bool
    quantity: int = 1
    price_per_unit: Decimal | None = None
    line_subtotal: Decimal | None = None
    line_discount: Decimal = Decimal("0")
    final_line_total: Decimal | None = None
    confidence: float = 0.0
    assignee: str | None = None  # user_id if 'full' assignment, None if split

    class Config:
        from_attributes = True


class ReceiptWithItemsOut(ReceiptOut):
    items: list[OCRLineItemOut] = Field(default_factory=list)


class ReceiptPatchRequest(BaseModel):
    nickname: str | None = None
    merchant_name: str | None = None
    total_amount: Decimal | None = None
    currency: str | None = None


class ReceiptShareLineOut(BaseModel):
    user_id: uuid.UUID
    display_name: str
    amount: Decimal
    is_paid: bool | None = None
    paid_at: datetime | None = None


class ReceiptShareOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    nickname: str | None = None
    merchant_name: str | None = None
    total_amount: Decimal | None = None
    currency: str | None = None
    paid_by_user_id: uuid.UUID | None = None
    status: str
    splits: list[ReceiptShareLineOut]
    can_mark_paid: bool = False
    my_share_amount: Decimal | None = None
