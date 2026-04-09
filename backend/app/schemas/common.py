import uuid
from datetime import datetime
from decimal import Decimal
from typing import Any

from pydantic import BaseModel, Field


class ErrorResponse(BaseModel):
    detail: str
    code: str = "INTERNAL_ERROR"


class PaginationResponse(BaseModel):
    items: list[Any]
    next_cursor: str | None = None
    has_more: bool = False


class UserOut(BaseModel):
    id: uuid.UUID
    email: str | None = None
    display_name: str
    profile_picture: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True


class GroupMemberOut(BaseModel):
    user_id: uuid.UUID
    display_name: str
    profile_picture: str | None = None
    role: str
    joined_at: datetime


class BalanceItem(BaseModel):
    user_id: uuid.UUID
    net_amount: Decimal = Field(..., decimal_places=2)
