import uuid
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_group_member
from app.db.session import get_db
from app.models.group_member import GroupMember
from app.models.manual_entry import ManualEntry, ManualEntrySplit, Settlement
from app.models.user import User
from app.schemas.entries import (
    ManualEntryCreateRequest,
    ManualEntryDetailOut,
    ManualEntryOut,
    ManualEntrySplitOut,
    ManualEntryUpdateRequest,
    ManualSplit,
    SettlementCreateRequest,
    SettlementOut,
)
from app.services.balances import compute_group_balances

router = APIRouter(prefix="/groups/{group_id}", tags=["entries"])


def _round_money(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _normalize_split_type(value: str) -> str:
    split_type = value.strip().lower()
    if split_type not in {"equal", "full", "percentage"}:
        raise HTTPException(status_code=400, detail="Unsupported split_type")
    return split_type


def _build_split_rows(
    total_amount: Decimal,
    split_type: str,
    paid_by: uuid.UUID,
    splits: list[ManualSplit],
    member_ids: set[uuid.UUID],
) -> list[dict[str, uuid.UUID | Decimal | None]]:
    if total_amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if paid_by not in member_ids:
        raise HTTPException(status_code=400, detail="paid_by must be a group member")

    if split_type == "equal":
        if len(member_ids) != 2:
            raise HTTPException(status_code=400, detail="MVP groups must have exactly 2 members")
        members_sorted = sorted(member_ids, key=lambda value: str(value))
        share_a = _round_money(total_amount / Decimal("2"))
        share_b = total_amount - share_a
        return [
            {"user_id": members_sorted[0], "amount": share_a, "percentage": None},
            {"user_id": members_sorted[1], "amount": share_b, "percentage": None},
        ]

    if split_type == "full":
        if len(splits) != 1:
            raise HTTPException(status_code=400, detail="Full split requires one split target")
        owe_user = splits[0].user_id
        if owe_user not in member_ids:
            raise HTTPException(status_code=400, detail="Split users must be group members")
        if owe_user == paid_by:
            raise HTTPException(status_code=400, detail="Payer cannot owe themselves")
        return [
            {"user_id": owe_user, "amount": _round_money(total_amount), "percentage": None},
        ]

    if split_type == "percentage":
        if len(splits) != 2:
            raise HTTPException(status_code=400, detail="Percentage split requires two users")
        if any(split.user_id not in member_ids for split in splits):
            raise HTTPException(status_code=400, detail="Split users must be group members")
        split_user_ids = {split.user_id for split in splits}
        if len(split_user_ids) != len(splits):
            raise HTTPException(status_code=400, detail="Duplicate split users are not allowed")
        total_percentage = sum(split.percentage or Decimal("0") for split in splits)
        if abs(total_percentage - Decimal("100")) > Decimal("0.01"):
            raise HTTPException(status_code=400, detail="Percentage must equal 100")

        first = splits[0]
        second = splits[1]
        first_amount = _round_money(total_amount * (first.percentage or 0) / Decimal("100"))
        second_amount = total_amount - first_amount
        if first_amount <= 0 or second_amount <= 0:
            raise HTTPException(status_code=400, detail="Each split amount must be positive")
        return [
            {"user_id": first.user_id, "amount": first_amount, "percentage": first.percentage},
            {"user_id": second.user_id, "amount": second_amount, "percentage": second.percentage},
        ]

    raise HTTPException(status_code=400, detail="Unsupported split_type")


async def _get_entry_for_group(
    db: AsyncSession, group_id: uuid.UUID, entry_id: uuid.UUID
) -> ManualEntry:
    entry = await db.get(ManualEntry, entry_id)
    if not entry or entry.group_id != group_id:
        raise HTTPException(status_code=404, detail="Entry not found")
    return entry


async def _get_entry_splits(db: AsyncSession, entry_id: uuid.UUID) -> list[ManualEntrySplit]:
    return (
        await db.scalars(
            select(ManualEntrySplit)
            .where(ManualEntrySplit.manual_entry_id == entry_id)
            .order_by(ManualEntrySplit.created_at.asc())
        )
    ).all()


def _serialize_entry_detail(
    entry: ManualEntry, splits: list[ManualEntrySplit]
) -> ManualEntryDetailOut:
    return ManualEntryDetailOut(
        id=entry.id,
        group_id=entry.group_id,
        created_by=entry.created_by,
        description=entry.description,
        total_amount=entry.total_amount,
        split_type=(
            entry.split_type.value
            if hasattr(entry.split_type, "value")
            else str(entry.split_type)
        ),
        created_at=entry.created_at,
        splits=[
            ManualEntrySplitOut(
                user_id=split.user_id,
                amount=split.amount,
                percentage=split.percentage,
            )
            for split in splits
        ],
    )


@router.post("/entries", response_model=ManualEntryOut, status_code=201)
async def create_entry(
    group_id: uuid.UUID,
    payload: ManualEntryCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    members = (await db.scalars(select(GroupMember).where(GroupMember.group_id == group_id))).all()
    member_ids = {m.user_id for m in members}
    split_type = _normalize_split_type(payload.split_type)
    split_rows = _build_split_rows(
        total_amount=payload.total_amount,
        split_type=split_type,
        paid_by=payload.paid_by,
        splits=payload.splits,
        member_ids=member_ids,
    )

    entry = ManualEntry(
        group_id=group_id,
        created_by=payload.paid_by,
        description=payload.description.strip(),
        total_amount=payload.total_amount,
        split_type=split_type,
    )
    db.add(entry)
    await db.flush()

    for split in split_rows:
        db.add(
            ManualEntrySplit(
                manual_entry_id=entry.id,
                user_id=split["user_id"],
                amount=split["amount"],
                percentage=split["percentage"],
            )
        )

    await db.commit()
    await db.refresh(entry)
    return ManualEntryOut.model_validate(entry)


@router.get("/entries", response_model=list[ManualEntryOut])
async def list_entries(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    rows = (
        await db.scalars(
            select(ManualEntry)
            .where(ManualEntry.group_id == group_id)
            .order_by(ManualEntry.created_at.desc())
        )
    ).all()
    return [ManualEntryOut.model_validate(row) for row in rows]


@router.get("/entries/{entry_id}", response_model=ManualEntryDetailOut)
async def get_entry(
    group_id: uuid.UUID,
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    entry = await _get_entry_for_group(db, group_id, entry_id)
    splits = await _get_entry_splits(db, entry.id)
    return _serialize_entry_detail(entry, splits)


@router.patch("/entries/{entry_id}", response_model=ManualEntryDetailOut)
async def update_entry(
    group_id: uuid.UUID,
    entry_id: uuid.UUID,
    payload: ManualEntryUpdateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    entry = await _get_entry_for_group(db, group_id, entry_id)
    existing_splits = await _get_entry_splits(db, entry.id)

    members = (await db.scalars(select(GroupMember).where(GroupMember.group_id == group_id))).all()
    member_ids = {member.user_id for member in members}

    split_type = _normalize_split_type(
        payload.split_type
        if payload.split_type is not None
        else entry.split_type.value if hasattr(entry.split_type, "value") else str(entry.split_type)
    )
    total_amount = payload.total_amount if payload.total_amount is not None else entry.total_amount
    paid_by = payload.paid_by if payload.paid_by is not None else entry.created_by

    if payload.splits is not None:
        splits_payload = payload.splits
    elif split_type == "equal":
        splits_payload = []
    else:
        splits_payload = [
            ManualSplit(user_id=split.user_id, percentage=split.percentage)
            for split in existing_splits
        ]

    split_rows = _build_split_rows(
        total_amount=total_amount,
        split_type=split_type,
        paid_by=paid_by,
        splits=splits_payload,
        member_ids=member_ids,
    )

    if payload.description is not None:
        entry.description = payload.description.strip()
    entry.total_amount = total_amount
    entry.created_by = paid_by
    entry.split_type = split_type

    await db.execute(delete(ManualEntrySplit).where(ManualEntrySplit.manual_entry_id == entry.id))
    for split in split_rows:
        db.add(
            ManualEntrySplit(
                manual_entry_id=entry.id,
                user_id=split["user_id"],
                amount=split["amount"],
                percentage=split["percentage"],
            )
        )

    await db.commit()
    await db.refresh(entry)
    updated_splits = await _get_entry_splits(db, entry.id)
    return _serialize_entry_detail(entry, updated_splits)


@router.delete("/entries/{entry_id}", status_code=204)
async def delete_entry(
    group_id: uuid.UUID,
    entry_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    entry = await _get_entry_for_group(db, group_id, entry_id)
    await db.delete(entry)
    await db.commit()
    return None


@router.post("/settlements", response_model=SettlementOut, status_code=201)
async def create_settlement(
    group_id: uuid.UUID,
    payload: SettlementCreateRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    balances = await compute_group_balances(db, group_id)
    if payload.amount <= 0:
        raise HTTPException(status_code=400, detail="Amount must be positive")
    if payload.paid_by == payload.paid_to:
        raise HTTPException(status_code=400, detail="paid_by and paid_to must differ")
    if payload.paid_by not in balances or payload.paid_to not in balances:
        raise HTTPException(status_code=400, detail="Users must be members")
    # paid_by should be debtor (negative), paid_to creditor (positive)
    if balances[payload.paid_by] >= 0 or balances[payload.paid_to] <= 0:
        raise HTTPException(status_code=400, detail="Settlement direction does not match balance")
    if payload.amount > abs(balances[payload.paid_by]):
        raise HTTPException(status_code=400, detail="Settlement amount exceeds outstanding balance")

    settlement = Settlement(
        group_id=group_id,
        paid_by=payload.paid_by,
        paid_to=payload.paid_to,
        amount=payload.amount,
        notes=payload.notes,
    )
    db.add(settlement)
    await db.commit()
    await db.refresh(settlement)
    return SettlementOut.model_validate(settlement)


@router.get("/settlements", response_model=list[SettlementOut])
async def list_settlements(
    group_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    rows = (
        await db.scalars(
            select(Settlement)
            .where(Settlement.group_id == group_id)
            .order_by(Settlement.settled_at.desc())
        )
    ).all()
    return [SettlementOut.model_validate(row) for row in rows]
