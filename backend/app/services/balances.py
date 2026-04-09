import uuid
from collections import defaultdict
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group_member import GroupMember
from app.models.line_item import ItemAssignment, LineItem
from app.models.manual_entry import ManualEntry, ManualEntrySplit, Settlement
from app.models.receipt import Receipt


async def compute_group_balances(db: AsyncSession, group_id: uuid.UUID) -> dict[uuid.UUID, Decimal]:
    members = (
        await db.scalars(select(GroupMember).where(GroupMember.group_id == group_id))
    ).all()
    totals: dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for member in members:
        totals[member.user_id] = Decimal("0.00")

    receipts = (await db.scalars(select(Receipt).where(Receipt.group_id == group_id))).all()
    for receipt in receipts:
        if receipt.status != "assigned":
            continue
        line_items = (
            await db.scalars(select(LineItem).where(LineItem.receipt_id == receipt.id))
        ).all()
        for item in line_items:
            assignments = (
                await db.scalars(select(ItemAssignment).where(ItemAssignment.line_item_id == item.id))
            ).all()
            payer_id = receipt.paid_by_user_id or receipt.uploaded_by
            for assignment in assignments:
                if assignment.user_id != payer_id:
                    totals[assignment.user_id] -= Decimal(str(assignment.share_amount))
                    totals[payer_id] += Decimal(str(assignment.share_amount))

    entries = (await db.scalars(select(ManualEntry).where(ManualEntry.group_id == group_id))).all()
    for entry in entries:
        splits = (
            await db.scalars(select(ManualEntrySplit).where(ManualEntrySplit.manual_entry_id == entry.id))
        ).all()
        for split in splits:
            if split.user_id != entry.created_by:
                totals[split.user_id] -= Decimal(str(split.amount))
                totals[entry.created_by] += Decimal(str(split.amount))

    settlements = (await db.scalars(select(Settlement).where(Settlement.group_id == group_id))).all()
    for settlement in settlements:
        amount = Decimal(str(settlement.amount))
        totals[settlement.paid_by] += amount
        totals[settlement.paid_to] -= amount

    return totals
