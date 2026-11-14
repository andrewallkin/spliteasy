#!/usr/bin/env python3
"""Seed fictional demo data for local screenshots and README demos."""

from __future__ import annotations

import argparse
import asyncio
import uuid
from datetime import datetime, timedelta, timezone
from decimal import Decimal

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.enums import GroupRole, ReceiptStatus, ShareType, SplitType
from app.models.group import Group
from app.models.group_member import GroupMember
from app.models.line_item import ItemAssignment, LineItem
from app.models.manual_entry import ManualEntry, ManualEntrySplit, Settlement
from app.models.receipt import Receipt
from app.models.user import User

DEMO_EMAIL = "demo@example.com"
DEMO_PASSWORD = "password123"
PARTNER_EMAIL = "partner@example.com"

USER_ALEX_ID = uuid.UUID("11111111-1111-4111-8111-111111111101")
USER_BLAIR_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")
GROUP_ID = uuid.UUID("33333333-3333-4333-8333-333333333303")
RECEIPT_DRAFT_ID = uuid.UUID("44444444-4444-4444-8444-444444444404")
RECEIPT_ASSIGNED_ID = uuid.UUID("55555555-5555-4555-8555-555555555505")
MANUAL_ENTRY_ID = uuid.UUID("66666666-6666-4666-8666-666666666606")
SETTLEMENT_ID = uuid.UUID("77777777-7777-4777-8777-777777777707")

DEMO_EMAILS = {DEMO_EMAIL, PARTNER_EMAIL}
DEMO_RECEIPT_IMAGE = "demo/synthetic-receipt.png"


async def wipe_demo_data(session) -> None:
    group = await session.get(Group, GROUP_ID)
    if group is not None:
        await session.delete(group)
    users = (await session.scalars(select(User).where(User.email.in_(DEMO_EMAILS)))).all()
    for user in users:
        await session.delete(user)


async def seed() -> None:
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(days=1)

    async with SessionLocal() as session:
        await wipe_demo_data(session)
        await session.flush()

        alex = User(
            id=USER_ALEX_ID,
            email=DEMO_EMAIL,
            display_name="Alex Demo",
            hashed_password=get_password_hash(DEMO_PASSWORD),
        )
        blair = User(
            id=USER_BLAIR_ID,
            email=PARTNER_EMAIL,
            display_name="Blair Partner",
            hashed_password=get_password_hash(DEMO_PASSWORD),
        )
        session.add_all([alex, blair])
        await session.flush()

        group = Group(
            id=GROUP_ID,
            name="Fictional Flatmates",
            created_by=USER_ALEX_ID,
        )
        session.add(group)
        await session.flush()

        session.add_all(
            [
                GroupMember(
                    group_id=GROUP_ID,
                    user_id=USER_ALEX_ID,
                    role=GroupRole.owner,
                    invited_by=None,
                ),
                GroupMember(
                    group_id=GROUP_ID,
                    user_id=USER_BLAIR_ID,
                    role=GroupRole.member,
                    invited_by=USER_ALEX_ID,
                ),
            ]
        )

        draft_receipt = Receipt(
            id=RECEIPT_DRAFT_ID,
            group_id=GROUP_ID,
            uploaded_by=USER_ALEX_ID,
            image_gcs_path=DEMO_RECEIPT_IMAGE,
            merchant_name="Pixel Pantry Groceries",
            receipt_date="2026-02-14",
            currency="ZAR",
            total_amount=Decimal("137.50"),
            status=ReceiptStatus.pending_review,
            paid_by_user_id=USER_ALEX_ID,
        )
        assigned_receipt = Receipt(
            id=RECEIPT_ASSIGNED_ID,
            group_id=GROUP_ID,
            uploaded_by=USER_BLAIR_ID,
            image_gcs_path=DEMO_RECEIPT_IMAGE,
            merchant_name="Neon Noodle Bar",
            receipt_date="2026-02-10",
            currency="ZAR",
            total_amount=Decimal("96.00"),
            status=ReceiptStatus.assigned,
            paid_by_user_id=USER_BLAIR_ID,
            nickname="Takeaway Tuesday",
        )
        session.add_all([draft_receipt, assigned_receipt])
        await session.flush()

        draft_lines = [
            ("Moon Cheese Puffs", Decimal("42.50"), 0),
            ("Rainbow Rice Cakes", Decimal("38.00"), 1),
            ("Sparkle Smoothie Mix", Decimal("57.00"), 2),
        ]
        for description, amount, sort_order in draft_lines:
            item = LineItem(
                receipt_id=RECEIPT_DRAFT_ID,
                group_id=GROUP_ID,
                description=description,
                amount=amount,
                final_line_total=amount,
                line_subtotal=amount,
                sort_order=sort_order,
                confidence=0.92,
            )
            session.add(item)

        assigned_amount = Decimal("96.00")
        assigned_item = LineItem(
            receipt_id=RECEIPT_ASSIGNED_ID,
            group_id=GROUP_ID,
            description="Dragon Bowl Ramen",
            amount=assigned_amount,
            final_line_total=assigned_amount,
            line_subtotal=assigned_amount,
            sort_order=0,
            confidence=1.0,
        )
        session.add(assigned_item)
        await session.flush()

        session.add(
            ItemAssignment(
                line_item_id=assigned_item.id,
                user_id=USER_ALEX_ID,
                share_type=ShareType.full,
                share_amount=assigned_amount,
            )
        )

        manual = ManualEntry(
            id=MANUAL_ENTRY_ID,
            group_id=GROUP_ID,
            created_by=USER_ALEX_ID,
            description="Fictional fibre bill",
            total_amount=Decimal("800.00"),
            split_type=SplitType.equal,
        )
        session.add(manual)
        await session.flush()
        session.add_all(
            [
                ManualEntrySplit(
                    manual_entry_id=MANUAL_ENTRY_ID,
                    user_id=USER_ALEX_ID,
                    amount=Decimal("400.00"),
                ),
                ManualEntrySplit(
                    manual_entry_id=MANUAL_ENTRY_ID,
                    user_id=USER_BLAIR_ID,
                    amount=Decimal("400.00"),
                ),
            ]
        )

        session.add(
            Settlement(
                id=SETTLEMENT_ID,
                group_id=GROUP_ID,
                paid_by=USER_BLAIR_ID,
                paid_to=USER_ALEX_ID,
                amount=Decimal("150.00"),
                notes="Paid via imaginary wallet",
                settled_at=yesterday,
            )
        )

        await session.commit()
        print("Seeded demo group:", GROUP_ID)
        print("Login:", DEMO_EMAIL, "/", DEMO_PASSWORD)


async def main() -> None:
    parser = argparse.ArgumentParser(description="Seed fictional SplitEasy demo data")
    parser.add_argument("--reset", action="store_true", help="Remove existing demo users and re-seed")
    args = parser.parse_args()
    if not args.reset:
        parser.error("Pass --reset to replace demo users and their data")
    await seed()


if __name__ == "__main__":
    asyncio.run(main())