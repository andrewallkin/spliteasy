import asyncio
import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user
from app.core.security import create_token, decode_token, get_password_hash, verify_password
from app.core.settings import get_settings
from app.db.session import get_db
from app.models.group import RefreshToken
from app.models.user import User
from app.schemas.auth import AuthResponse, LoginRequest, RegisterRequest, TokenResponse
from app.schemas.common import UserOut
from app.services.gcs import GCSService, get_gcs_service

router = APIRouter(prefix="/auth", tags=["auth"])
settings = get_settings()


def _make_user_out(user: User, gcs: GCSService) -> UserOut:
    url = gcs.generate_signed_url(user.image_gcs_path) if user.image_gcs_path else None
    return UserOut.model_validate(user).model_copy(update={"profile_picture": url})

EMAIL_NOT_ALLOWED_DETAIL = "This email is not allowed to use this application."


def _require_allowed_email(normalized_email: str) -> None:
    allowed = settings.allowed_email_set
    if not allowed or normalized_email in allowed:
        return
    raise HTTPException(status_code=403, detail=EMAIL_NOT_ALLOWED_DETAIL)


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
async def register(
    payload: RegisterRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    gcs: GCSService = Depends(get_gcs_service),
):
    normalized_email = payload.email.strip().lower()
    _require_allowed_email(normalized_email)
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
    user_out = await asyncio.to_thread(_make_user_out, user, gcs)
    return AuthResponse(access_token=access_token, user=user_out)


@router.post("/login", response_model=AuthResponse)
async def login(
    payload: LoginRequest,
    response: Response,
    db: AsyncSession = Depends(get_db),
    gcs: GCSService = Depends(get_gcs_service),
):
    normalized_email = payload.email.strip().lower()
    _require_allowed_email(normalized_email)
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
    user_out = await asyncio.to_thread(_make_user_out, user, gcs)
    return AuthResponse(access_token=access_token, user=user_out)


@router.post("/refresh", response_model=TokenResponse)
async def refresh(request: Request, response: Response, db: AsyncSession = Depends(get_db)):
    refresh_token = request.cookies.get("refresh_token")
    if not refresh_token:
        raise HTTPException(status_code=401, detail="Missing refresh cookie")

    try:
        payload = decode_token(refresh_token)
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    try:
        jti = uuid.UUID(payload["jti"])
        sub = uuid.UUID(payload["sub"])
    except (KeyError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    token_row = await db.scalar(
        select(RefreshToken).where(
            RefreshToken.id == jti,
            RefreshToken.expires_at > datetime.now(timezone.utc),
        )
    )
    if not token_row or token_row.is_revoked:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    if token_row.is_used:
        family_tokens = (
            await db.scalars(
                select(RefreshToken).where(RefreshToken.family_id == token_row.family_id)
            )
        ).all()
        for t in family_tokens:
            t.is_revoked = True
        await db.commit()
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    user = await db.scalar(select(User).where(User.id == sub))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="Invalid refresh token")

    token_row.is_used = True
    new_access, _ = create_token(
        str(sub), timedelta(minutes=settings.jwt_access_token_expire_minutes)
    )
    new_refresh, new_jti = create_token(
        str(sub), timedelta(days=settings.jwt_refresh_token_expire_days)
    )
    db.add(
        RefreshToken(
            id=new_jti,
            user_id=sub,
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
