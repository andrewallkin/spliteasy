import base64
import binascii

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import get_password_hash, verify_password
from app.db.session import get_db
from app.models.user import User
from app.schemas.common import UserOut
from app.schemas.users import ChangePasswordRequest, UpdateProfileRequest

router = APIRouter(prefix="/users", tags=["users"])
MAX_PROFILE_PICTURE_BYTES = 10 * 1024 * 1024


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)):
    return UserOut.model_validate(user)


@router.patch("/me", response_model=UserOut)
async def update_profile(
    payload: UpdateProfileRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if payload.display_name is not None:
        user.display_name = payload.display_name.strip()
    if payload.profile_picture is not None:
        if payload.profile_picture:
            encoded_payload = payload.profile_picture
            if "," in encoded_payload and encoded_payload.startswith("data:"):
                encoded_payload = encoded_payload.split(",", 1)[1]
            try:
                decoded = base64.b64decode(encoded_payload, validate=True)
            except binascii.Error as exc:
                raise HTTPException(status_code=400, detail="Profile picture must be a valid base64 image") from exc
            if len(decoded) > MAX_PROFILE_PICTURE_BYTES:
                raise HTTPException(status_code=400, detail="Profile picture must be under 10 MB")
        user.profile_picture = payload.profile_picture if payload.profile_picture else None
    await db.commit()
    await db.refresh(user)
    return UserOut.model_validate(user)


@router.post("/me/password", status_code=204)
async def change_password(
    payload: ChangePasswordRequest,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if not verify_password(payload.current_password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.hashed_password = get_password_hash(payload.new_password)
    await db.commit()
