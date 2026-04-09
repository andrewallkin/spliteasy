import uuid

from fastapi import Depends, Header, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import decode_token
from app.db.session import get_db
from app.models.group_member import GroupMember
from app.models.user import User


async def get_current_user(
    authorization: str | None = Header(default=None), db: AsyncSession = Depends(get_db)
) -> User:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing credentials",
        )
    token = authorization.replace("Bearer ", "", 1)
    try:
        payload = decode_token(token)
        user_id = uuid.UUID(payload["sub"])
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=401, detail="Could not validate credentials") from exc

    user = await db.scalar(select(User).where(User.id == user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    return user


async def require_group_member(group_id: uuid.UUID, user: User, db: AsyncSession) -> GroupMember:
    membership = await db.scalar(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user.id)
    )
    if not membership:
        raise HTTPException(status_code=403, detail="You are not a member of this group.")
    return membership
