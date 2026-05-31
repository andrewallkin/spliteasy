import uuid
from collections import defaultdict
from datetime import datetime
from decimal import Decimal
from typing import Literal

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.line_item import ItemAssignment, LineItem
from app.models.manual_entry import ManualEntry, ManualEntrySplit, Settlement
from app.models.receipt import Receipt

ExpenseKind = Literal["entry", "receipt"]


async def get_receipt_share_totals(
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
    for assignment in assignments:
        rid = line_to_receipt.get(assignment.line_item_id)
        if rid is None:
            continue
        totals[rid][assignment.user_id] += Decimal(str(assignment.share_amount))
    return {rid: dict(users) for rid, users in totals.items()}


async def get_paid_map(
    db: AsyncSession,
    entry_ids: list[uuid.UUID] | None = None,
    receipt_ids: list[uuid.UUID] | None = None,
) -> dict[tuple[ExpenseKind, uuid.UUID, uuid.UUID], datetime]:
    """Map (kind, expense_id, paid_by) -> settled_at for mark-as-paid settlements."""
    out: dict[tuple[ExpenseKind, uuid.UUID, uuid.UUID], datetime] = {}
    if entry_ids:
        rows = (
            await db.scalars(
                select(Settlement).where(Settlement.manual_entry_id.in_(entry_ids))
            )
        ).all()
        for row in rows:
            if row.manual_entry_id is not None:
                out[("entry", row.manual_entry_id, row.paid_by)] = row.settled_at
    if receipt_ids:
        rows = (
            await db.scalars(
                select(Settlement).where(Settlement.receipt_id.in_(receipt_ids))
            )
        ).all()
        for row in rows:
            if row.receipt_id is not None:
                out[("receipt", row.receipt_id, row.paid_by)] = row.settled_at
    return out


def get_entry_share(
    entry: ManualEntry, splits: list[ManualEntrySplit], user_id: uuid.UUID
) -> Decimal | None:
    if user_id == entry.created_by:
        return None
    for split in splits:
        if split.user_id == user_id:
            return Decimal(str(split.amount))
    return None


async def get_receipt_share(
    db: AsyncSession, receipt: Receipt, user_id: uuid.UUID
) -> Decimal | None:
    payer_id = receipt.paid_by_user_id or receipt.uploaded_by
    if user_id == payer_id:
        return None
    totals = await get_receipt_share_totals(db, [receipt.id])
    share = totals.get(receipt.id, {}).get(user_id)
    if share is None or share <= 0:
        return None
    return share


async def entry_has_linked_settlements(db: AsyncSession, entry_id: uuid.UUID) -> bool:
    row = await db.scalar(
        select(Settlement.id).where(Settlement.manual_entry_id == entry_id).limit(1)
    )
    return row is not None


async def receipt_has_linked_settlements(db: AsyncSession, receipt_id: uuid.UUID) -> bool:
    row = await db.scalar(
        select(Settlement.id).where(Settlement.receipt_id == receipt_id).limit(1)
    )
    return row is not None


def _entry_label(entry: ManualEntry) -> str:
    return entry.description.strip()


def _receipt_label(receipt: Receipt) -> str:
    return (receipt.nickname or receipt.merchant_name or "Receipt").strip()


async def create_entry_mark_paid(
    db: AsyncSession,
    group_id: uuid.UUID,
    entry: ManualEntry,
    splits: list[ManualEntrySplit],
    user_id: uuid.UUID,
) -> Settlement:
    if entry.group_id != group_id:
        raise HTTPException(status_code=404, detail="Entry not found")
    share = get_entry_share(entry, splits, user_id)
    if share is None:
        raise HTTPException(status_code=400, detail="You have no share to mark as paid on this expense")
    existing = await db.scalar(
        select(Settlement).where(
            Settlement.manual_entry_id == entry.id,
            Settlement.paid_by == user_id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already marked as paid")

    settlement = Settlement(
        group_id=group_id,
        paid_by=user_id,
        paid_to=entry.created_by,
        amount=share,
        notes=f"Marked paid: {_entry_label(entry)}"[:255],
        manual_entry_id=entry.id,
    )
    db.add(settlement)
    await db.commit()
    await db.refresh(settlement)
    return settlement


async def delete_entry_mark_paid(
    db: AsyncSession,
    group_id: uuid.UUID,
    entry: ManualEntry,
    user_id: uuid.UUID,
) -> None:
    if entry.group_id != group_id:
        raise HTTPException(status_code=404, detail="Entry not found")
    settlement = await db.scalar(
        select(Settlement).where(
            Settlement.manual_entry_id == entry.id,
            Settlement.paid_by == user_id,
        )
    )
    if not settlement:
        raise HTTPException(status_code=404, detail="Not marked as paid")
    await db.delete(settlement)
    await db.commit()


async def create_receipt_mark_paid(
    db: AsyncSession,
    group_id: uuid.UUID,
    receipt: Receipt,
    user_id: uuid.UUID,
) -> Settlement:
    if receipt.group_id != group_id:
        raise HTTPException(status_code=404, detail="Receipt not found")
    if receipt.status != "assigned":
        raise HTTPException(status_code=400, detail="Receipt must be assigned before marking as paid")
    share = await get_receipt_share(db, receipt, user_id)
    if share is None:
        raise HTTPException(status_code=400, detail="You have no share to mark as paid on this receipt")
    existing = await db.scalar(
        select(Settlement).where(
            Settlement.receipt_id == receipt.id,
            Settlement.paid_by == user_id,
        )
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already marked as paid")

    payer_id = receipt.paid_by_user_id or receipt.uploaded_by
    settlement = Settlement(
        group_id=group_id,
        paid_by=user_id,
        paid_to=payer_id,
        amount=share,
        notes=f"Marked paid: {_receipt_label(receipt)}"[:255],
        receipt_id=receipt.id,
    )
    db.add(settlement)
    await db.commit()
    await db.refresh(settlement)
    return settlement


async def delete_receipt_mark_paid(
    db: AsyncSession,
    group_id: uuid.UUID,
    receipt: Receipt,
    user_id: uuid.UUID,
) -> None:
    if receipt.group_id != group_id:
        raise HTTPException(status_code=404, detail="Receipt not found")
    settlement = await db.scalar(
        select(Settlement).where(
            Settlement.receipt_id == receipt.id,
            Settlement.paid_by == user_id,
        )
    )
    if not settlement:
        raise HTTPException(status_code=404, detail="Not marked as paid")
    await db.delete(settlement)
    await db.commit()


def build_entry_split_outs(
    entry: ManualEntry,
    splits: list[ManualEntrySplit],
    paid_map: dict[tuple[ExpenseKind, uuid.UUID, uuid.UUID], datetime],
) -> list[dict]:
    lines = []
    for split in splits:
        is_payer_row = split.user_id == entry.created_by
        paid_at = None if is_payer_row else paid_map.get(("entry", entry.id, split.user_id))
        lines.append(
            {
                "user_id": split.user_id,
                "amount": split.amount,
                "percentage": split.percentage,
                "is_paid": None if is_payer_row else paid_at is not None,
                "paid_at": paid_at,
            }
        )
    return lines


def entry_mark_paid_flags(
    entry: ManualEntry,
    splits: list[ManualEntrySplit],
    user_id: uuid.UUID,
    paid_map: dict[tuple[ExpenseKind, uuid.UUID, uuid.UUID], datetime],
) -> tuple[bool, Decimal | None]:
    share = get_entry_share(entry, splits, user_id)
    if share is None:
        return False, None
    already_paid = ("entry", entry.id, user_id) in paid_map
    return not already_paid, share


def build_receipt_share_lines(
    receipt: Receipt,
    share_totals: dict[uuid.UUID, Decimal],
    display_name_map: dict[uuid.UUID, str],
    paid_map: dict[tuple[ExpenseKind, uuid.UUID, uuid.UUID], datetime],
) -> list[dict]:
    payer_id = receipt.paid_by_user_id or receipt.uploaded_by
    lines = []
    for uid, amount in share_totals.items():
        is_payer_row = uid == payer_id
        paid_at = None if is_payer_row else paid_map.get(("receipt", receipt.id, uid))
        lines.append(
            {
                "user_id": uid,
                "display_name": display_name_map.get(uid, "Unknown"),
                "amount": amount,
                "is_paid": None if is_payer_row else paid_at is not None,
                "paid_at": paid_at,
            }
        )
    lines.sort(key=lambda line: line["display_name"])
    return lines


def receipt_mark_paid_flags(
    receipt: Receipt,
    share_totals: dict[uuid.UUID, Decimal],
    user_id: uuid.UUID,
    paid_map: dict[tuple[ExpenseKind, uuid.UUID, uuid.UUID], datetime],
) -> tuple[bool, Decimal | None]:
    payer_id = receipt.paid_by_user_id or receipt.uploaded_by
    if user_id == payer_id:
        return False, None
    share = share_totals.get(user_id)
    if share is None or share <= 0:
        return False, None
    if receipt.status != "assigned":
        return False, share
    already_paid = ("receipt", receipt.id, user_id) in paid_map
    return not already_paid, share
