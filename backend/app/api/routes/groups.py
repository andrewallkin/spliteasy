import base64
import binascii
import secrets
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_group_member
from app.core.settings import get_settings
from app.db.session import get_db
from app.models.enums import GroupRole
from app.models.group import Group, GroupBalance, GroupInvitation
from app.models.group_member import GroupMember
from app.models.line_item import ItemAssignment, LineItem
from app.models.manual_entry import ManualEntry, ManualEntrySplit, Settlement
from app.models.receipt import Receipt
from app.models.user import User
from app.schemas.common import GroupMemberOut, SuggestedSettlement
from app.schemas.groups import (
    GroupBalanceResponse,
    GroupCreateRequest,
    GroupInviteRequest,
    GroupJoinByCodeRequest,
    GroupJoinRequest,
    GroupOut,
    GroupProfilePictureRequest,
    GroupUpdateRequest,
)
from app.services.balances import compute_group_balances, compute_suggested_settlements
from app.services.gcs import GCSService, get_gcs_service
from app.services.mark_paid import (
    build_entry_split_outs,
    build_receipt_share_lines,
    entry_mark_paid_flags,
    get_paid_map,
    receipt_mark_paid_flags,
)

_JOIN_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
_MAX_GROUP_PICTURE_BYTES = 10 * 1024 * 1024


def _make_group_out(group: Group, gcs: GCSService) -> GroupOut:
    url = gcs.generate_signed_url(group.image_gcs_path) if group.image_gcs_path else None
    return GroupOut.model_validate(group).model_copy(update={"profile_picture": url})


def _make_member_out(member: GroupMember, user: User | None, gcs: GCSService) -> GroupMemberOut:
    pic_path = user.image_gcs_path if user else None
    url = gcs.generate_signed_url(pic_path) if pic_path else None
    return GroupMemberOut(
        user_id=member.user_id,
        display_name=user.display_name if user else "unknown",
        profile_picture=url,
        role=member.role.value if hasattr(member.role, "value") else str(member.role),
        joined_at=member.joined_at,
    )

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
    entries: list[ManualEntry],
    splits_by_entry: dict[uuid.UUID, list[ManualEntrySplit]],
    display_name_map: dict[uuid.UUID, str],
    paid_map: dict,
) -> dict[uuid.UUID, list[dict]]:
    out: dict[uuid.UUID, list[dict]] = {}
    for entry in entries:
        splits = splits_by_entry.get(entry.id, [])
        lines = []
        for line in build_entry_split_outs(entry, splits, paid_map):
            paid_at = line["paid_at"]
            lines.append(
                {
                    "user_id": str(line["user_id"]),
                    "display_name": display_name_map.get(line["user_id"], "unknown"),
                    "amount": str(line["amount"]),
                    "is_paid": line["is_paid"],
                    "paid_at": paid_at.isoformat() if paid_at else None,
                }
            )
        lines.sort(key=lambda row: row["display_name"])
        out[entry.id] = lines
    return out


def _history_entry_flags(
    entry: ManualEntry,
    splits: list[ManualEntrySplit],
    current_user_id: uuid.UUID,
    paid_map: dict,
) -> tuple[bool, str | None]:
    can_mark_paid, my_share_amount = entry_mark_paid_flags(entry, splits, current_user_id, paid_map)
    return can_mark_paid, str(my_share_amount) if my_share_amount is not None else None


async def _receipt_share_totals_by_receipt_id(
    db: AsyncSession, receipt_ids: list[uuid.UUID]
) -> dict[uuid.UUID, dict[uuid.UUID, Decimal]]:
    if not receipt_ids:
        return {}
    line_items = (
        await db.scalars(select(LineItem).where(LineItem.receipt_id.in_(receipt_ids)))
    ).all()
    line_to_receipt: dict[uuid.UUID, uuid.UUID] = {}
    for li in line_items:
        if li.receipt_id is not None:
            line_to_receipt[li.id] = li.receipt_id
    line_ids = list(line_to_receipt.keys())
    if not line_ids:
        return {}
    assignments = (
        await db.scalars(select(ItemAssignment).where(ItemAssignment.line_item_id.in_(line_ids)))
    ).all()
    totals: dict[uuid.UUID, dict[uuid.UUID, Decimal]] = defaultdict(
        lambda: defaultdict(lambda: Decimal("0.00"))
    )
    for a in assignments:
        rid = line_to_receipt.get(a.line_item_id)
        if rid is None:
            continue
        totals[rid][a.user_id] += Decimal(str(a.share_amount))
    return {rid: dict(users) for rid, users in totals.items()}


def _history_receipt_splits_payload(
    receipts: list[Receipt],
    share_totals: dict[uuid.UUID, dict[uuid.UUID, Decimal]],
    display_name_map: dict[uuid.UUID, str],
    paid_map: dict,
) -> dict[uuid.UUID, list[dict]]:
    out: dict[uuid.UUID, list[dict]] = {}
    for receipt in receipts:
        per_user = share_totals.get(receipt.id, {})
        lines = []
        for line in build_receipt_share_lines(receipt, per_user, display_name_map, paid_map):
            paid_at = line["paid_at"]
            lines.append(
                {
                    "user_id": str(line["user_id"]),
                    "display_name": line["display_name"],
                    "amount": str(line["amount"]),
                    "is_paid": line["is_paid"],
                    "paid_at": paid_at.isoformat() if paid_at else None,
                }
            )
        out[receipt.id] = lines
    return out


def _history_receipt_flags(
    receipt: Receipt,
    share_totals: dict[uuid.UUID, Decimal],
    current_user_id: uuid.UUID,
    paid_map: dict,
) -> tuple[bool, str | None]:
    can_mark_paid, my_share_amount = receipt_mark_paid_flags(
        receipt, share_totals, current_user_id, paid_map
    )
    return can_mark_paid, str(my_share_amount) if my_share_amount is not None else None


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
    gcs: GCSService = Depends(get_gcs_service),
):
    group = Group(name=_normalize_group_name(payload.name), created_by=user.id)
    db.add(group)
    await db.flush()
    db.add(GroupMember(group_id=group.id, user_id=user.id, role="owner"))
    await db.commit()
    await db.refresh(group)
    return _make_group_out(group, gcs)


@router.get("", response_model=list[GroupOut])
async def list_groups(
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    groups = (
        await db.scalars(
            select(Group)
            .join(GroupMember, GroupMember.group_id == Group.id)
            .where(GroupMember.user_id == user.id)
            .order_by(Group.created_at.desc())
        )
    ).all()
    return [_make_group_out(g, gcs) for g in groups]


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
        receipt_share_totals = await _receipt_share_totals_by_receipt_id(db, [r.id for r in receipts])
        paid_map = await get_paid_map(
            db,
            entry_ids=[],
            receipt_ids=[r.id for r in receipts],
        )
        receipt_splits_payload = _history_receipt_splits_payload(
            receipts, receipt_share_totals, user_map, paid_map
        )
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
                    "paid_by": user_map.get(
                        receipt.paid_by_user_id or receipt.uploaded_by,
                        "unknown",
                    ),
                    "image_count": receipt.image_count,
                    "splits": receipt_splits_payload.get(receipt.id, []),
                    "can_mark_paid": _history_receipt_flags(
                        receipt,
                        receipt_share_totals.get(receipt.id, {}),
                        user.id,
                        paid_map,
                    )[0],
                    "my_share_amount": _history_receipt_flags(
                        receipt,
                        receipt_share_totals.get(receipt.id, {}),
                        user.id,
                        paid_map,
                    )[1],
                },
            } for receipt in receipts]
        )
    if type in (None, "entry"):
        entries = (
            await db.scalars(select(ManualEntry).where(ManualEntry.group_id.in_(target_group_ids)))
        ).all()
        splits_by_entry = await _manual_entry_splits_by_entry_id(db, [e.id for e in entries])
        paid_map = await get_paid_map(
            db,
            entry_ids=[e.id for e in entries],
            receipt_ids=[],
        )
        splits_payload = _history_entry_splits_payload(entries, splits_by_entry, user_map, paid_map)
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
                    "can_mark_paid": _history_entry_flags(
                        entry,
                        splits_by_entry.get(entry.id, []),
                        user.id,
                        paid_map,
                    )[0],
                    "my_share_amount": _history_entry_flags(
                        entry,
                        splits_by_entry.get(entry.id, []),
                        user.id,
                        paid_map,
                    )[1],
                },
            } for entry in entries]
        )
    if type in (None, "settlement"):
        settlements = (
            await db.scalars(
                select(Settlement).where(
                    Settlement.group_id.in_(target_group_ids),
                    Settlement.manual_entry_id.is_(None),
                    Settlement.receipt_id.is_(None),
                )
            )
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
    gcs: GCSService = Depends(get_gcs_service),
):
    await require_group_member(group_id, user, db)
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    return _make_group_out(group, gcs)


@router.patch("/{group_id}", response_model=GroupOut)
async def update_group(
    group_id: uuid.UUID,
    payload: GroupUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
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
    return _make_group_out(group, gcs)


@router.patch("/{group_id}/profile-picture", response_model=GroupOut)
async def update_group_profile_picture(
    group_id: uuid.UUID,
    payload: GroupProfilePictureRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    await require_group_member(group_id, user, db)
    group = await db.get(Group, group_id)
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")

    if payload.profile_picture:
        encoded_payload = payload.profile_picture
        if "," in encoded_payload and encoded_payload.startswith("data:"):
            encoded_payload = encoded_payload.split(",", 1)[1]
        try:
            decoded = base64.b64decode(encoded_payload, validate=True)
        except binascii.Error as exc:
            raise HTTPException(status_code=400, detail="Profile picture must be a valid base64 image") from exc
        if len(decoded) > _MAX_GROUP_PICTURE_BYTES:
            raise HTTPException(status_code=400, detail="Profile picture must be under 10 MB")
        # Delete old GCS object before uploading the new one
        if group.image_gcs_path:
            gcs.delete_image(group.image_gcs_path)
        settings = get_settings()
        gcs_path = gcs.upload_image(
            settings.group_profile_image_folder, f"{group_id}.jpg", decoded, "image/jpeg"
        )
        if gcs_path is None:
            raise HTTPException(status_code=500, detail="Failed to upload group profile picture")
        group.image_gcs_path = gcs_path
    else:
        if group.image_gcs_path:
            gcs.delete_image(group.image_gcs_path)
        group.image_gcs_path = None

    await db.commit()
    await db.refresh(group)
    return _make_group_out(group, gcs)


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
    gcs: GCSService = Depends(get_gcs_service),
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
        result.append(_make_member_out(m, u, gcs))
    return result


@router.post("/{group_id}/invite", status_code=201)
async def invite_member(
    group_id: uuid.UUID,
    payload: GroupInviteRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
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


@router.get("/{group_id}/balances/suggested-settlements", response_model=list[SuggestedSettlement])
async def suggested_settlements(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    totals = await compute_group_balances(db, group_id)
    transfers = compute_suggested_settlements(totals)

    # Resolve display names
    members = (await db.scalars(select(GroupMember).where(GroupMember.group_id == group_id))).all()
    name_map: dict[uuid.UUID, str] = {}
    for m in members:
        u = await db.get(User, m.user_id)
        name_map[m.user_id] = u.display_name if u else "Unknown"

    return [
        SuggestedSettlement(
            from_user_id=t["from_user_id"],
            from_display_name=name_map.get(t["from_user_id"], "Unknown"),
            to_user_id=t["to_user_id"],
            to_display_name=name_map.get(t["to_user_id"], "Unknown"),
            amount=t["amount"],
        )
        for t in transfers
    ]


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
        receipt_share_totals = await _receipt_share_totals_by_receipt_id(db, [r.id for r in receipts])
        paid_map = await get_paid_map(
            db,
            entry_ids=[],
            receipt_ids=[r.id for r in receipts],
        )
        receipt_splits_payload = _history_receipt_splits_payload(
            receipts, receipt_share_totals, user_map, paid_map
        )
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
                    "paid_by": user_map.get(r.paid_by_user_id or r.uploaded_by, "unknown"),
                    "image_count": r.image_count,
                    "splits": receipt_splits_payload.get(r.id, []),
                    "can_mark_paid": _history_receipt_flags(
                        r,
                        receipt_share_totals.get(r.id, {}),
                        user.id,
                        paid_map,
                    )[0],
                    "my_share_amount": _history_receipt_flags(
                        r,
                        receipt_share_totals.get(r.id, {}),
                        user.id,
                        paid_map,
                    )[1],
                },
            } for r in receipts]
        )
    if type in (None, "entry"):
        entries = (await db.scalars(select(ManualEntry).where(ManualEntry.group_id == group_id))).all()
        splits_by_entry = await _manual_entry_splits_by_entry_id(db, [e.id for e in entries])
        paid_map = await get_paid_map(
            db,
            entry_ids=[e.id for e in entries],
            receipt_ids=[],
        )
        splits_payload = _history_entry_splits_payload(entries, splits_by_entry, user_map, paid_map)
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
                    "can_mark_paid": _history_entry_flags(
                        e,
                        splits_by_entry.get(e.id, []),
                        user.id,
                        paid_map,
                    )[0],
                    "my_share_amount": _history_entry_flags(
                        e,
                        splits_by_entry.get(e.id, []),
                        user.id,
                        paid_map,
                    )[1],
                },
            } for e in entries]
        )
    if type in (None, "settlement"):
        settlements = (
            await db.scalars(
                select(Settlement).where(
                    Settlement.group_id == group_id,
                    Settlement.manual_entry_id.is_(None),
                    Settlement.receipt_id.is_(None),
                )
            )
        ).all()
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
