import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import create_token, get_password_hash, verify_password
from app.core.settings import get_settings
from app.db.session import get_db
from app.models.group import RefreshToken
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, TokenResponse
from app.schemas.common import UserOut

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _set_refresh_cookie(response: Response, refresh_token: str) -> None:
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=settings.cookie_secure,
        samesite="lax",
        path="/api/auth",
        max_age=settings.jwt_refresh_token_expire_days * 24 * 60 * 60,
    )


@router.post("/register", response_model=AuthResponse, status_code=201)
async def register(payload: RegisterRequest, response: Response, db: AsyncSession = Depends(get_db)):
    normalized_email = payload.email.strip().lower()
    existing_email = await db.scalar(select(User).where(User.email == normalized_email))
    if existing_email:
        raise HTTPException(status_code=409, detail="Email already taken")

    user = User(
        email=normalized_email,
        display_name=payload.display_name.strip(),
        hashed_password=get_password_hash(payload.password),
    )
    db.add(user)
    await db.flush()

    access_token, _ = create_token(
        str(user.id), timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    refresh_token, refresh_jti = create_token(
        str(user.id), timedelta(days=settings.jwt_refresh_token_expire_days)
    )
    db.add(
        RefreshToken(
            id=refresh_jti,
            user_id=user.id,
            family_id=uuid.uuid4(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
        )
    )
    await db.commit()
    _set_refresh_cookie(response, refresh_token)
    return AuthResponse(access_token=access_token, user=UserOut.model_validate(user))


@router.post("/login", response_model=AuthResponse)
async def login(payload: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    normalized_email = payload.email.strip().lower()
    user = await db.scalar(select(User).where(User.email == normalized_email))
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is inactive")

    access_token, _ = create_token(
        str(user.id), timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    refresh_token, refresh_jti = create_token(
        str(user.id), timedelta(days=settings.jwt_refresh_token_expire_days)
    )
    db.add(
        RefreshToken(
            id=refresh_jti,
            user_id=user.id,
            family_id=uuid.uuid4(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
        )
    )
    await db.commit()
    _set_refresh_cookie(response, refresh_token)
    return AuthResponse(access_token=access_token, user=UserOut.model_validate(user))


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh cookie")
    from app.core.security import decode_token

    payload = decode_token(refresh_token)
    token_row = await db.scalar(select(RefreshToken).where(RefreshToken.id == uuid.UUID(payload["jti"])))
    if not token_row or token_row.is_used or token_row.is_revoked:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    token_row.is_used = True
    new_access, _ = create_token(
        payload["sub"], timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    new_refresh, new_jti = create_token(
        payload["sub"], timedelta(days=settings.jwt_refresh_token_expire_days)
    )
    db.add(
        RefreshToken(
            id=new_jti,
            user_id=uuid.UUID(payload["sub"]),
            family_id=token_row.family_id,
            expires_at=datetime.now(timezone.utc) + timedelta(days=settings.jwt_refresh_token_expire_days),
        )
    )
    await db.commit()
    _set_refresh_cookie(response, new_refresh)
    return TokenResponse(access_token=new_access)


@router.post("/logout", status_code=204)
async def logout(
    response: Response,
    user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    rows = (await db.scalars(select(RefreshToken).where(RefreshToken.user_id == user.id))).all()
    for row in rows:
        row.is_revoked = True
    await db.commit()
    response.delete_cookie("refresh_token", path="/api/auth")
    return Response(status_code=204)
