import secrets
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_group_member
from app.db.session import get_db
from app.models.enums import GroupRole
from app.models.group import Group, GroupBalance, GroupInvitation
from app.models.group_member import GroupMember
from app.models.manual_entry import ManualEntry, ManualEntrySplit, Settlement
from app.models.receipt import Receipt
from app.models.user import User
from app.schemas.common import GroupMemberOut
from app.schemas.groups import (
    GroupBalanceResponse,
    GroupCreateRequest,
    GroupInviteRequest,
    GroupJoinByCodeRequest,
    GroupJoinRequest,
    GroupOut,
    GroupUpdateRequest,
)
from app.services.balances import compute_group_balances

_JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"

router = APIRouter(prefix="/groups", tags=["groups"])


async def _manual_entry_splits_by_entry_id(
    db: AsyncSession, entry_ids: list[uuid.UUID]
) -> dict[uuid.UUID, list[ManualEntrySplit]]:
    if not entry_ids:
        return {}
    rows = (
        await db.scalars(
            select(ManualEntrySplit).where(ManualEntrySplit.manual_entry_id.in_(entry_ids))
        )
    ).all()
    grouped: dict[uuid.UUID, list[ManualEntrySplit]] = {}
    for row in rows:
        grouped.setdefault(row.manual_entry_id, []).append(row)
    return grouped


def _history_entry_splits_payload(
    splits_by_entry: dict[uuid.UUID, list[ManualEntrySplit]],
    display_name_map: dict[uuid.UUID, str],
) -> dict[uuid.UUID, list[dict[str, str]]]:
    out: dict[uuid.UUID, list[dict[str, str]]] = {}
    for entry_id, splits in splits_by_entry.items():
        lines = [
            {"display_name": display_name_map.get(s.user_id, "unknown"), "amount": str(s.amount)}
            for s in splits
        ]
        lines.sort(key=lambda line: line["display_name"])
        out[entry_id] = lines
    return out


def _generate_join_code() -> str:
    return "".join(secrets.choice(_JOIN_CODE_ALPHABET) for _ in range(6))


def _is_group_owner(role: object) -> bool:
    return role == GroupRole.owner or role == GroupRole.owner.value


def _normalize_group_name(name: str) -> str:
    normalized_name = name.strip()
    if not normalized_name:
        raise HTTPException(status_code=400, detail="Group name cannot be empty")
    return normalized_name


@router.post("", response_model=GroupOut, status_code=201)
async def create_group(
    payload: GroupCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    group = Group(name=_normalize_group_name(payload.name), created_by=user.id)
    db.add(group)
    await db.flush()
    db.add(GroupMember(group_id=group.id, user_id=user.id, role="owner"))
    await db.commit()
    await db.refresh(group)
    return GroupOut.model_validate(group)


@router.get("", response_model=list[GroupOut])
async def list_groups(db: AsyncSession = Depends(get_db), user: User = Depends(get_current_user)):
    groups = (
        await db.scalars(
            select(Group)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(GroupMember.user_id == user.id)
            .order_by(Group.created_at.desc())
        )
    ).all()
    return [GroupOut.model_validate(g) for g in groups]


@router.post("/join-by-code")
async def join_group_by_code(
    payload: GroupJoinByCodeRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    code = payload.code.strip().upper()
    invitation = await db.scalar(
        select(GroupInvitation).where(GroupInvitation.join_code == code)
    )
    if not invitation:
        raise HTTPException(status_code=404, detail="Invalid join code")
    if invitation.invited_email and (
        not user.email or user.email.lower() != invitation.invited_email.lower()
    ):
        raise HTTPException(status_code=403, detail="This invitation is not for your account")
    if invitation.accepted_at is not None:
        raise HTTPException(status_code=409, detail="Invitation already used")
    if invitation.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invitation has expired")
    members = (
        await db.scalars(select(GroupMember).where(GroupMember.group_id == invitation.group_id))
    ).all()
    if len(members) >= 2:
        raise HTTPException(status_code=400, detail="Group already full")
    already_member = await db.scalar(
        select(GroupMember).where(
            GroupMember.group_id == invitation.group_id,
            GroupMember.user_id == user.id,
        )
    )
    if already_member:
        raise HTTPException(status_code=409, detail="You are already a member of this group")
    db.add(
        GroupMember(
            group_id=invitation.group_id,
            user_id=user.id,
            invited_by=invitation.invited_by,
            role="member",
        )
    )
    invitation.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"joined": True, "group_id": str(invitation.group_id)}


@router.get("/history")
async def global_history(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    type: str | None = None,  # noqa: A002
    group_id: uuid.UUID | None = None,
):
    memberships = (
        await db.scalars(
            select(GroupMember).where(GroupMember.user_id == user.id)
        )
    ).all()
    member_group_ids = {membership.group_id for membership in memberships}
    if group_id and group_id not in member_group_ids:
        raise HTTPException(status_code=403, detail="You are not a member of this group")
    target_group_ids = [group_id] if group_id else list(member_group_ids)
    if not target_group_ids:
        return {"items": [], "next_cursor": None, "has_more": False}

    groups = (
        await db.scalars(select(Group).where(Group.id.in_(target_group_ids)))
    ).all()
    group_name_map = {group.id: group.name for group in groups}

    group_members = (
        await db.scalars(
            select(GroupMember).where(GroupMember.group_id.in_(target_group_ids))
        )
    ).all()
    member_user_ids = {group_member.user_id for group_member in group_members}
    users = (
        await db.scalars(select(User).where(User.id.in_(member_user_ids)))
    ).all()
    user_map = {member.id: member.display_name for member in users}

    items: list[dict] = []
    if type in (None, "receipt"):
        receipts = (
            await db.scalars(
                select(Receipt).where(
                    Receipt.group_id.in_(target_group_ids),
                    Receipt.status == "assigned",
                )
            )
        ).all()
        items.extend(
            [{
                "type": "receipt",
                "id": str(receipt.id),
                "group_id": str(receipt.group_id),
                "group_name": group_name_map.get(receipt.group_id, "Unknown group"),
                "timestamp": receipt.created_at,
                "data": {
                    "status": receipt.status,
                    "nickname": receipt.nickname,
                    "merchant_name": receipt.merchant_name,
                    "total_amount": str(receipt.total_amount) if receipt.total_amount else None,
                    "currency": receipt.currency,
                    "uploaded_by": user_map.get(receipt.uploaded_by, "unknown"),
                    "paid_by_user_id": str(receipt.paid_by_user_id) if receipt.paid_by_user_id else None,
                },
            } for receipt in receipts]
        )
    if type in (None, "entry"):
        entries = (
            await db.scalars(select(ManualEntry).where(ManualEntry.group_id.in_(target_group_ids)))
        ).all()
        splits_by_entry = await _manual_entry_splits_by_entry_id(db, [e.id for e in entries])
        splits_payload = _history_entry_splits_payload(splits_by_entry, user_map)
        items.extend(
            [{
                "type": "entry",
                "id": str(entry.id),
                "group_id": str(entry.group_id),
                "group_name": group_name_map.get(entry.group_id, "Unknown group"),
                "timestamp": entry.created_at,
                "data": {
                    "description": entry.description,
                    "total_amount": str(entry.total_amount),
                    "split_type": entry.split_type,
                    "created_by": user_map.get(entry.created_by, "unknown"),
                    "splits": splits_payload.get(entry.id, []),
                },
            } for entry in entries]
        )
    if type in (None, "settlement"):
        settlements = (
            await db.scalars(select(Settlement).where(Settlement.group_id.in_(target_group_ids)))
        ).all()
        items.extend(
            [{
                "type": "settlement",
                "id": str(settlement.id),
                "group_id": str(settlement.group_id),
                "group_name": group_name_map.get(settlement.group_id, "Unknown group"),
                "timestamp": settlement.settled_at,
                "data": {
                    "amount": str(settlement.amount),
                    "notes": settlement.notes,
                    "paid_by": user_map.get(settlement.paid_by, "unknown"),
                    "paid_to": user_map.get(settlement.paid_to, "unknown"),
                },
            } for settlement in settlements]
        )
    items.sort(key=lambda item: item["timestamp"], reverse=True)
    return {"items": items, "next_cursor": None, "has_more": False}


@router.get("/{group_id}", response_model=GroupOut)
async def get_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return GroupOut.model_validate(group)


@router.patch("/{group_id}", response_model=GroupOut)
async def update_group(
    group_id: uuid.UUID,
    payload: GroupUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await require_group_member(group_id, user, db)
    if not _is_group_owner(membership.role):
        raise HTTPException(status_code=403, detail="Only owner can rename group")

    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    group.name = _normalize_group_name(payload.name)
    await db.commit()
    await db.refresh(group)
    return GroupOut.model_validate(group)


@router.delete("/{group_id}", status_code=204)
async def delete_group(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await require_group_member(group_id, user, db)
    if not _is_group_owner(membership.role):
        raise HTTPException(status_code=403, detail="Only owner can delete group")

    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    await db.delete(group)
    await db.commit()
    return None


@router.get("/{group_id}/members", response_model=list[GroupMemberOut])
async def list_members(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    rows = (
        await db.scalars(
            select(GroupMember)
            .where(GroupMember.group_id == group_id)
            .order_by(GroupMember.joined_at)
        )
    ).all()
    result = []
    for m in rows:
        u = await db.get(User, m.user_id)
        result.append(GroupMemberOut(
            user_id=m.user_id,
            display_name=u.display_name if u else "unknown",
            profile_picture=u.profile_picture if u else None,
            role=m.role.value if hasattr(m.role, "value") else str(m.role),
            joined_at=m.joined_at,
        ))
    return result


@router.post("/{group_id}/invite", status_code=201)
async def invite_member(
    group_id: uuid.UUID,
    payload: GroupInviteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    member_count = len(
        (
            await db.scalars(select(GroupMember).where(GroupMember.group_id == group_id))
        ).all()
    )
    if member_count >= 2:
        raise HTTPException(status_code=400, detail="Group already has two members")

    normalized_email = payload.email.strip().lower()
    invited_user = await db.scalar(select(User).where(User.email == normalized_email))
    if not invited_user:
        raise HTTPException(status_code=404, detail="No user found with that email")

    already_member = await db.scalar(
        select(GroupMember).where(
            GroupMember.group_id == group_id,
            GroupMember.user_id == invited_user.id,
        )
    )
    if already_member:
        raise HTTPException(status_code=409, detail="User is already a member of this group")

    existing = await db.scalar(
        select(GroupInvitation).where(
            GroupInvitation.group_id == group_id,
            GroupInvitation.invited_email == normalized_email,
            GroupInvitation.accepted_at.is_(None),
            GroupInvitation.expires_at > datetime.now(timezone.utc),
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Pending invitation already exists for this user")

    join_code = _generate_join_code()
    for _ in range(10):
        collision = await db.scalar(
            select(GroupInvitation).where(GroupInvitation.join_code == join_code)
        )
        if not collision:
            break
        join_code = _generate_join_code()

    invite = GroupInvitation(
        group_id=group_id,
        invited_by=user.id,
        invited_email=normalized_email,
        join_code=join_code,
        expires_at=datetime.now(timezone.utc) + timedelta(days=7),
    )
    db.add(invite)
    await db.commit()
    return {"invitation_id": str(invite.id), "join_code": join_code}


@router.get("/{group_id}/invitations")
async def list_invitations(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    rows = (
        await db.scalars(
            select(GroupInvitation)
            .where(GroupInvitation.group_id == group_id)
            .order_by(GroupInvitation.created_at.desc())
        )
    ).all()
    now = datetime.now(timezone.utc)
    result = []
    for inv in rows:
        status = "accepted" if inv.accepted_at else ("expired" if inv.expires_at <= now else "pending")
        result.append({
            "invitation_id": str(inv.id),
            "invited_email": inv.invited_email,
            "join_code": inv.join_code,
            "status": status,
            "expires_at": inv.expires_at.isoformat(),
            "created_at": inv.created_at.isoformat(),
        })
    return result


@router.post("/{group_id}/join")
async def join_group(
    group_id: uuid.UUID,
    payload: GroupJoinRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    invitation = await db.get(GroupInvitation, payload.invitation_id)
    if not invitation or invitation.group_id != group_id:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if invitation.invited_email and (
        not user.email or user.email.lower() != invitation.invited_email.lower()
    ):
        raise HTTPException(status_code=403, detail="This invitation is not for your account")
    if invitation.accepted_at is not None:
        raise HTTPException(status_code=409, detail="Invitation already used")
    if invitation.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(status_code=410, detail="Invitation has expired")
    members = (await db.scalars(select(GroupMember).where(GroupMember.group_id == group_id))).all()
    if len(members) >= 2:
        raise HTTPException(status_code=400, detail="Group already full")
    db.add(GroupMember(group_id=group_id, user_id=user.id, invited_by=invitation.invited_by, role="member"))
    invitation.accepted_at = datetime.now(timezone.utc)
    await db.commit()
    return {"joined": True}


@router.delete("/{group_id}/members/{user_id}", status_code=204)
async def remove_member(
    group_id: uuid.UUID,
    user_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    membership = await require_group_member(group_id, user, db)
    target = await db.scalar(
        select(GroupMember).where(GroupMember.group_id == group_id, GroupMember.user_id == user_id)
    )
    if not target:
        raise HTTPException(status_code=404, detail="Member not found")
    if not _is_group_owner(membership.role) and user.id != user_id:
        raise HTTPException(status_code=403, detail="Only owner can remove others")
    await db.delete(target)
    await db.commit()
    return None


@router.get("/{group_id}/balances", response_model=GroupBalanceResponse)
async def get_balances(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    totals = await compute_group_balances(db, group_id)
    # Persist latest computed snapshot.
    for member_id, amount in totals.items():
        row = await db.scalar(
            select(GroupBalance).where(GroupBalance.group_id == group_id, GroupBalance.user_id == member_id)
        )
        if not row:
            db.add(GroupBalance(group_id=group_id, user_id=member_id, net_amount=amount))
        else:
            row.net_amount = amount
    await db.commit()
    total_owed = sum(abs(v) for v in totals.values() if v < 0)
    return GroupBalanceResponse(
        group_id=group_id,
        balances=[{"user_id": uid, "net_amount": Decimal(v)} for uid, v in totals.items()],
        is_settled=all(v == 0 for v in totals.values()),
        total_owed=Decimal(total_owed),
    )


@router.get("/{group_id}/history")
async def history(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    type: str | None = None,  # noqa: A002
):
    await require_group_member(group_id, user, db)
    group = await db.get(Group, group_id)
    members = (await db.scalars(select(GroupMember).where(GroupMember.group_id == group_id))).all()
    user_map: dict[uuid.UUID, str] = {}
    for m in members:
        u = await db.get(User, m.user_id)
        user_map[m.user_id] = u.display_name if u else "unknown"

    items: list[dict] = []
    if type in (None, "receipt"):
        receipts = (await db.scalars(
            select(Receipt).where(
                Receipt.group_id == group_id,
                Receipt.status == "assigned",
            )
        )).all()
        items.extend(
            [{
                "type": "receipt",
                "id": str(r.id),
                "group_id": str(group_id),
                "group_name": group.name if group else "Unknown group",
                "timestamp": r.created_at,
                "data": {
                    "status": r.status,
                    "nickname": r.nickname,
                    "merchant_name": r.merchant_name,
                    "total_amount": str(r.total_amount) if r.total_amount else None,
                    "currency": r.currency,
                    "uploaded_by": user_map.get(r.uploaded_by, "unknown"),
                    "paid_by_user_id": str(r.paid_by_user_id) if r.paid_by_user_id else None,
                },
            } for r in receipts]
        )
    if type in (None, "entry"):
        entries = (await db.scalars(select(ManualEntry).where(ManualEntry.group_id == group_id))).all()
        splits_by_entry = await _manual_entry_splits_by_entry_id(db, [e.id for e in entries])
        splits_payload = _history_entry_splits_payload(splits_by_entry, user_map)
        items.extend(
            [{
                "type": "entry",
                "id": str(e.id),
                "group_id": str(group_id),
                "group_name": group.name if group else "Unknown group",
                "timestamp": e.created_at,
                "data": {
                    "description": e.description,
                    "total_amount": str(e.total_amount),
                    "split_type": e.split_type,
                    "created_by": user_map.get(e.created_by, "unknown"),
                    "splits": splits_payload.get(e.id, []),
                },
            } for e in entries]
        )
    if type in (None, "settlement"):
        settlements = (await db.scalars(select(Settlement).where(Settlement.group_id == group_id))).all()
        items.extend(
            [{
                "type": "settlement",
                "id": str(s.id),
                "group_id": str(group_id),
                "group_name": group.name if group else "Unknown group",
                "timestamp": s.settled_at,
                "data": {
                    "amount": str(s.amount),
                    "notes": s.notes,
                    "paid_by": user_map.get(s.paid_by, "unknown"),
                    "paid_to": user_map.get(s.paid_to, "unknown"),
                },
            } for s in settlements]
        )
    items.sort(key=lambda item: item["timestamp"], reverse=True)
    return {"items": items, "next_cursor": None, "has_more": False}
