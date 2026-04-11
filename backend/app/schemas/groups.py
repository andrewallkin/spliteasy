import uuid
from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, EmailStr, Field

from app.schemas.common import BalanceItem


class GroupCreateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class GroupUpdateRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)


class GroupInviteRequest(BaseModel):
    email: EmailStr


class GroupJoinRequest(BaseModel):
    invitation_id: uuid.UUID


class GroupJoinByCodeRequest(BaseModel):
    code: str = Field(min_length=6, max_length=6)


class GroupOut(BaseModel):
    id: uuid.UUID
    name: str
    profile_picture: str | None = None
    created_by: uuid.UUID
    created_at: datetime

    class Config:
        from_attributes = True


class GroupProfilePictureRequest(BaseModel):
    profile_picture: str


class GroupBalanceResponse(BaseModel):
    group_id: uuid.UUID
    balances: list[BalanceItem]
    is_settled: bool
    total_owed: Decimal
