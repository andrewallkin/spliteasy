import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, Field, model_validator


class ManualSplit(BaseModel):
    user_id: uuid.UUID
    percentage: Decimal | None = None


class ManualEntryCreateRequest(BaseModel):
    description: str = Field(min_length=1, max_length=200)
    total_amount: Decimal
    split_type: str
    paid_by: uuid.UUID
    splits: list[ManualSplit]


class ManualEntryUpdateRequest(BaseModel):
    description: str | None = Field(default=None, min_length=1, max_length=200)
    total_amount: Decimal | None = None
    split_type: str | None = None
    paid_by: uuid.UUID | None = None
    splits: list[ManualSplit] | None = None

    @model_validator(mode="after")
    def ensure_any_field_provided(self) -> "ManualEntryUpdateRequest":
        if all(
            value is None
            for value in (
                self.description,
                self.total_amount,
                self.split_type,
                self.paid_by,
                self.splits,
            )
        ):
            raise ValueError("At least one field must be provided")
        return self


class ManualEntryOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    created_by: uuid.UUID
    description: str
    total_amount: Decimal
    split_type: str
    created_at: datetime

    class Config:
        from_attributes = True


class ManualEntrySplitOut(BaseModel):
    user_id: uuid.UUID
    amount: Decimal
    percentage: Decimal | None = None
    is_paid: bool | None = None
    paid_at: datetime | None = None


class ManualEntryDetailOut(ManualEntryOut):
    splits: list[ManualEntrySplitOut]
    can_mark_paid: bool = False
    my_share_amount: Decimal | None = None


class SettlementCreateRequest(BaseModel):
    paid_by: uuid.UUID
    paid_to: uuid.UUID
    amount: Decimal
    notes: str | None = Field(default=None, max_length=200)


class SettlementOut(BaseModel):
    id: uuid.UUID
    group_id: uuid.UUID
    paid_by: uuid.UUID
    paid_to: uuid.UUID
    amount: Decimal
    notes: str | None
    settled_at: datetime

    class Config:
        from_attributes = True
