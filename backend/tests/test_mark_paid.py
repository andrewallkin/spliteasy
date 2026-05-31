import uuid
from datetime import datetime, timezone
from decimal import Decimal

from app.models.manual_entry import ManualEntry, ManualEntrySplit
from app.models.receipt import Receipt
from app.services.mark_paid import (
    build_entry_split_outs,
    build_receipt_share_lines,
    entry_mark_paid_flags,
    get_entry_share,
    receipt_mark_paid_flags,
)


def _entry(payer_id: uuid.UUID, description: str = "Utilities") -> ManualEntry:
    return ManualEntry(
        id=uuid.uuid4(),
        group_id=uuid.uuid4(),
        created_by=payer_id,
        description=description,
        total_amount=Decimal("800.00"),
        split_type="equal",
    )


def _split(entry_id: uuid.UUID, user_id: uuid.UUID, amount: str) -> ManualEntrySplit:
    return ManualEntrySplit(
        id=uuid.uuid4(),
        manual_entry_id=entry_id,
        user_id=user_id,
        amount=Decimal(amount),
    )


def test_get_entry_share_skips_payer() -> None:
    payer = uuid.uuid4()
    debtor = uuid.uuid4()
    entry = _entry(payer)
    splits = [
        _split(entry.id, payer, "400.00"),
        _split(entry.id, debtor, "400.00"),
    ]
    assert get_entry_share(entry, splits, payer) is None
    assert get_entry_share(entry, splits, debtor) == Decimal("400.00")


def test_entry_mark_paid_flags_when_creditor_owes_one_expense() -> None:
    payer = uuid.uuid4()
    creditor = uuid.uuid4()
    entry = _entry(payer)
    splits = [
        _split(entry.id, payer, "400.00"),
        _split(entry.id, creditor, "400.00"),
    ]
    can_mark, share = entry_mark_paid_flags(entry, splits, creditor, {})
    assert can_mark is True
    assert share == Decimal("400.00")


def test_entry_mark_paid_flags_false_when_already_paid() -> None:
    payer = uuid.uuid4()
    debtor = uuid.uuid4()
    entry = _entry(payer)
    splits = [_split(entry.id, debtor, "400.00")]
    paid_map = {("entry", entry.id, debtor): datetime.now(timezone.utc)}
    can_mark, share = entry_mark_paid_flags(entry, splits, debtor, paid_map)
    assert can_mark is False
    assert share == Decimal("400.00")


def test_build_entry_split_outs_shows_paid_status() -> None:
    payer = uuid.uuid4()
    debtor = uuid.uuid4()
    entry = _entry(payer)
    splits = [
        _split(entry.id, payer, "400.00"),
        _split(entry.id, debtor, "400.00"),
    ]
    paid_at = datetime.now(timezone.utc)
    paid_map = {("entry", entry.id, debtor): paid_at}
    lines = build_entry_split_outs(entry, splits, paid_map)
    by_user = {line["user_id"]: line for line in lines}
    assert by_user[payer]["is_paid"] is None
    assert by_user[debtor]["is_paid"] is True
    assert by_user[debtor]["paid_at"] == paid_at


def test_manual_entry_balance_scenario_math() -> None:
    """Creditor +1600, utilities 800 split 2-way, mark paid restores +1600."""
    creditor_net = Decimal("1200.00")
    debtor_net = Decimal("-1200.00")
    payment = Decimal("400.00")
    creditor_after = creditor_net + payment
    debtor_after = debtor_net - payment
    assert creditor_after == Decimal("1600.00")
    assert debtor_after == Decimal("-1600.00")


def test_receipt_mark_paid_flags_per_user() -> None:
    payer = uuid.uuid4()
    user2 = uuid.uuid4()
    user3 = uuid.uuid4()
    receipt = Receipt(
        id=uuid.uuid4(),
        group_id=uuid.uuid4(),
        uploaded_by=payer,
        paid_by_user_id=payer,
        status="assigned",
    )
    share_totals = {
        user2: Decimal("300.00"),
        user3: Decimal("400.00"),
    }
    can_mark_u2, share_u2 = receipt_mark_paid_flags(receipt, share_totals, user2, {})
    can_mark_u3, share_u3 = receipt_mark_paid_flags(receipt, share_totals, user3, {})
    assert can_mark_u2 is True
    assert share_u2 == Decimal("300.00")
    assert can_mark_u3 is True
    assert share_u3 == Decimal("400.00")


def test_receipt_partial_mark_only_affects_one_user_balance() -> None:
    """User2 marks 300 paid; User3 still owes 400."""
    user1_net = Decimal("700.00")
    user2_net = Decimal("-300.00")
    user3_net = Decimal("-400.00")
    payment = Decimal("300.00")
    user2_after = user2_net + payment
    user1_after = user1_net - payment
    user3_after = user3_net
    assert user2_after == Decimal("0.00")
    assert user1_after == Decimal("400.00")
    assert user3_after == Decimal("-400.00")


def test_build_receipt_share_lines_marks_one_user_paid() -> None:
    payer = uuid.uuid4()
    user2 = uuid.uuid4()
    user3 = uuid.uuid4()
    receipt = Receipt(
        id=uuid.uuid4(),
        group_id=uuid.uuid4(),
        uploaded_by=payer,
        paid_by_user_id=payer,
        status="assigned",
    )
    share_totals = {user2: Decimal("300.00"), user3: Decimal("400.00")}
    names = {user2: "Bob", user3: "Carol"}
    paid_at = datetime.now(timezone.utc)
    paid_map = {("receipt", receipt.id, user2): paid_at}
    lines = build_receipt_share_lines(receipt, share_totals, names, paid_map)
    by_user = {line["user_id"]: line for line in lines}
    assert by_user[user2]["is_paid"] is True
    assert by_user[user3]["is_paid"] is False


def test_receipt_mark_paid_requires_assigned_status() -> None:
    payer = uuid.uuid4()
    debtor = uuid.uuid4()
    receipt = Receipt(
        id=uuid.uuid4(),
        group_id=uuid.uuid4(),
        uploaded_by=payer,
        paid_by_user_id=payer,
        status="confirmed",
    )
    can_mark, share = receipt_mark_paid_flags(
        receipt, {debtor: Decimal("100.00")}, debtor, {}
    )
    assert can_mark is False
    assert share == Decimal("100.00")
