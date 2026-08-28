import uuid
from collections import defaultdict
from collections.abc import Iterable, Sequence
from decimal import Decimal

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.group_member import GroupMember
from app.models.line_item import ItemAssignment, LineItem
from app.models.manual_entry import ManualEntry, ManualEntrySplit, Settlement
from app.models.receipt import Receipt


def accumulate_group_balances(
    member_ids: Iterable[uuid.UUID],
    receipts: Sequence[Receipt],
    line_items: Sequence[LineItem],
    assignments: Sequence[ItemAssignment],
    entries: Sequence[ManualEntry],
    splits: Sequence[ManualEntrySplit],
    settlements: Sequence[Settlement],
) -> dict[uuid.UUID, Decimal]:
    totals: dict[uuid.UUID, Decimal] = defaultdict(lambda: Decimal("0.00"))
    for member_id in member_ids:
        totals[member_id] = Decimal("0.00")

    items_by_receipt: dict[uuid.UUID, list[LineItem]] = defaultdict(list)
    for item in line_items:
        if item.receipt_id is not None:
            items_by_receipt[item.receipt_id].append(item)

    assignments_by_item: dict[uuid.UUID, list[ItemAssignment]] = defaultdict(list)
    for assignment in assignments:
        assignments_by_item[assignment.line_item_id].append(assignment)

    for receipt in receipts:
        status = receipt.status.value if hasattr(receipt.status, "value") else str(receipt.status)
        if status != "assigned":
            continue
        payer_id = receipt.paid_by_user_id or receipt.uploaded_by
        for item in items_by_receipt.get(receipt.id, []):
            for assignment in assignments_by_item.get(item.id, []):
                if assignment.user_id != payer_id:
                    totals[assignment.user_id] -= Decimal(str(assignment.share_amount))
                    totals[payer_id] += Decimal(str(assignment.share_amount))

    splits_by_entry: dict[uuid.UUID, list[ManualEntrySplit]] = defaultdict(list)
    for split in splits:
        splits_by_entry[split.manual_entry_id].append(split)

    for entry in entries:
        for split in splits_by_entry.get(entry.id, []):
            if split.user_id != entry.created_by:
                totals[split.user_id] -= Decimal(str(split.amount))
                totals[entry.created_by] += Decimal(str(split.amount))

    for settlement in settlements:
        amount = Decimal(str(settlement.amount))
        totals[settlement.paid_by] += amount
        totals[settlement.paid_to] -= amount

    return totals


async def compute_group_balances(db: AsyncSession, group_id: uuid.UUID) -> dict[uuid.UUID, Decimal]:
    members = (
        await db.scalars(select(GroupMember).where(GroupMember.group_id == group_id))
    ).all()
    member_ids = [member.user_id for member in members]

    receipts = (await db.scalars(select(Receipt).where(Receipt.group_id == group_id))).all()
    receipt_ids = [receipt.id for receipt in receipts]
    line_items = (
        (await db.scalars(select(LineItem).where(LineItem.receipt_id.in_(receipt_ids)))).all()
        if receipt_ids
        else []
    )
    line_item_ids = [item.id for item in line_items]
    assignments = (
        (
            await db.scalars(
                select(ItemAssignment).where(ItemAssignment.line_item_id.in_(line_item_ids))
            )
        ).all()
        if line_item_ids
        else []
    )

    entries = (await db.scalars(select(ManualEntry).where(ManualEntry.group_id == group_id))).all()
    entry_ids = [entry.id for entry in entries]
    splits = (
        (
            await db.scalars(
                select(ManualEntrySplit).where(ManualEntrySplit.manual_entry_id.in_(entry_ids))
            )
        ).all()
        if entry_ids
        else []
    )
    settlements = (
        await db.scalars(select(Settlement).where(Settlement.group_id == group_id))
    ).all()

    return accumulate_group_balances(
        member_ids=member_ids,
        receipts=receipts,
        line_items=line_items,
        assignments=assignments,
        entries=entries,
        splits=splits,
        settlements=settlements,
    )


def compute_suggested_settlements(
    balances: dict[uuid.UUID, Decimal],
) -> list[dict[str, uuid.UUID | Decimal]]:
    """Compute minimal set of transfers to settle all debts using a greedy algorithm."""
    debtors: list[list] = []  # [user_id, abs_amount]
    creditors: list[list] = []  # [user_id, amount]

    for uid, amount in balances.items():
        if amount < 0:
            debtors.append([uid, abs(amount)])
        elif amount > 0:
            creditors.append([uid, amount])

    # Sort descending by amount for greedy matching
    debtors.sort(key=lambda x: x[1], reverse=True)
    creditors.sort(key=lambda x: x[1], reverse=True)

    transfers: list[dict[str, uuid.UUID | Decimal]] = []
    di, ci = 0, 0
    while di < len(debtors) and ci < len(creditors):
        d_id, d_amt = debtors[di]
        c_id, c_amt = creditors[ci]
        transfer = min(d_amt, c_amt)
        if transfer > 0:
            transfers.append({
                "from_user_id": d_id,
                "to_user_id": c_id,
                "amount": transfer,
            })
        debtors[di][1] -= transfer
        creditors[ci][1] -= transfer
        if debtors[di][1] == 0:
            di += 1
        if creditors[ci][1] == 0:
            ci += 1

    return transfers
