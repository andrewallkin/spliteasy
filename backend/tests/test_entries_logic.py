import uuid
from decimal import Decimal

import pytest
from fastapi import HTTPException

from app.api.routes.entries import _build_split_rows, _normalize_split_type
from app.schemas.entries import ManualEntryUpdateRequest, ManualSplit


def test_normalize_split_type_accepts_mixed_case() -> None:
    assert _normalize_split_type(" Percentage ") == "percentage"


def test_build_split_rows_equal_splits_amount_evenly() -> None:
    member_a = uuid.uuid4()
    member_b = uuid.uuid4()

    rows = _build_split_rows(
        total_amount=Decimal("40"),
        split_type="equal",
        paid_by=member_a,
        splits=[],
        member_ids={member_a, member_b},
    )

    assert len(rows) == 2
    assert sum(Decimal(str(row["amount"])) for row in rows) == Decimal("40.00")


def test_build_split_rows_full_rejects_payer_owing_self() -> None:
    member_a = uuid.uuid4()
    member_b = uuid.uuid4()

    with pytest.raises(HTTPException, match="Payer cannot owe themselves"):
        _build_split_rows(
            total_amount=Decimal("20"),
            split_type="full",
            paid_by=member_a,
            splits=[ManualSplit(user_id=member_a)],
            member_ids={member_a, member_b},
        )


def test_build_split_rows_percentage_requires_total_hundred() -> None:
    member_a = uuid.uuid4()
    member_b = uuid.uuid4()

    with pytest.raises(HTTPException, match="Percentage must equal 100"):
        _build_split_rows(
            total_amount=Decimal("20"),
            split_type="percentage",
            paid_by=member_a,
            splits=[
                ManualSplit(user_id=member_a, percentage=Decimal("40")),
                ManualSplit(user_id=member_b, percentage=Decimal("50")),
            ],
            member_ids={member_a, member_b},
        )


def test_manual_entry_update_request_requires_at_least_one_field() -> None:
    with pytest.raises(ValueError, match="At least one field must be provided"):
        ManualEntryUpdateRequest()
