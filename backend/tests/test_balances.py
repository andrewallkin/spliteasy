import uuid
from decimal import Decimal

from app.models.line_item import ItemAssignment, LineItem
from app.models.manual_entry import ManualEntry, ManualEntrySplit, Settlement
from app.models.receipt import Receipt
from app.services.balances import accumulate_group_balances


def test_accumulate_skips_unassigned_receipts() -> None:
    payer = uuid.uuid4()
    other = uuid.uuid4()
    receipt = Receipt(
        id=uuid.uuid4(),
        group_id=uuid.uuid4(),
        uploaded_by=payer,
        paid_by_user_id=payer,
        status="pending_review",
    )
    item = LineItem(
        id=uuid.uuid4(),
        receipt_id=receipt.id,
        group_id=receipt.group_id,
        description="Burger",
        amount=Decimal("10.00"),
    )
    assignment = ItemAssignment(
        id=uuid.uuid4(),
        line_item_id=item.id,
        user_id=other,
        share_type="full",
        share_amount=Decimal("10.00"),
    )
    totals = accumulate_group_balances(
        member_ids=[payer, other],
        receipts=[receipt],
        line_items=[item],
        assignments=[assignment],
        entries=[],
        splits=[],
        settlements=[],
    )
    assert totals[payer] == Decimal("0.00")
    assert totals[other] == Decimal("0.00")


def test_accumulate_assigned_receipt_and_entry_and_settlement() -> None:
    payer = uuid.uuid4()
    debtor = uuid.uuid4()
    group_id = uuid.uuid4()
    receipt = Receipt(
        id=uuid.uuid4(),
        group_id=group_id,
        uploaded_by=payer,
        paid_by_user_id=payer,
        status="assigned",
    )
    item = LineItem(
        id=uuid.uuid4(),
        receipt_id=receipt.id,
        group_id=group_id,
        description="Coffee",
        amount=Decimal("20.00"),
    )
    assignment = ItemAssignment(
        id=uuid.uuid4(),
        line_item_id=item.id,
        user_id=debtor,
        share_type="full",
        share_amount=Decimal("20.00"),
    )
    entry = ManualEntry(
        id=uuid.uuid4(),
        group_id=group_id,
        created_by=payer,
        description="Utilities",
        total_amount=Decimal("800.00"),
        split_type="equal",
    )
    splits = [
        ManualEntrySplit(
            id=uuid.uuid4(),
            manual_entry_id=entry.id,
            user_id=payer,
            amount=Decimal("400.00"),
        ),
        ManualEntrySplit(
            id=uuid.uuid4(),
            manual_entry_id=entry.id,
            user_id=debtor,
            amount=Decimal("400.00"),
        ),
    ]
    settlement = Settlement(
        id=uuid.uuid4(),
        group_id=group_id,
        paid_by=debtor,
        paid_to=payer,
        amount=Decimal("50.00"),
    )
    totals = accumulate_group_balances(
        member_ids=[payer, debtor],
        receipts=[receipt],
        line_items=[item],
        assignments=[assignment],
        entries=[entry],
        splits=splits,
        settlements=[settlement],
    )
    # Receipt +20/-20, entry +400/-400, settlement -50/+50.
    assert totals[payer] == Decimal("370.00")
    assert totals[debtor] == Decimal("-370.00")


def test_accumulate_uses_uploader_when_paid_by_missing() -> None:
    uploader = uuid.uuid4()
    other = uuid.uuid4()
    receipt = Receipt(
        id=uuid.uuid4(),
        group_id=uuid.uuid4(),
        uploaded_by=uploader,
        paid_by_user_id=None,
        status="assigned",
    )
    item = LineItem(
        id=uuid.uuid4(),
        receipt_id=receipt.id,
        group_id=receipt.group_id,
        description="Taxi",
        amount=Decimal("30.00"),
    )
    assignment = ItemAssignment(
        id=uuid.uuid4(),
        line_item_id=item.id,
        user_id=other,
        share_type="full",
        share_amount=Decimal("30.00"),
    )
    totals = accumulate_group_balances(
        member_ids=[uploader, other],
        receipts=[receipt],
        line_items=[item],
        assignments=[assignment],
        entries=[],
        splits=[],
        settlements=[],
    )
    assert totals[uploader] == Decimal("30.00")
    assert totals[other] == Decimal("-30.00")
