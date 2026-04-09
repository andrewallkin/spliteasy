import asyncio
from decimal import Decimal

from sqlalchemy import select

from app.core.security import get_password_hash
from app.db.session import SessionLocal
from app.models.group import Group
from app.models.group_member import GroupMember
from app.models.manual_entry import ManualEntry, ManualEntrySplit, Settlement
from app.models.user import User


async def run() -> None:
    async with SessionLocal() as db:
        existing = await db.scalar(select(User).where(User.email == "andrew@example.com"))
        if existing:
            return

        andrew = User(
            email="andrew@example.com",
            display_name="Andrew",
            hashed_password=get_password_hash("password123"),
        )
        jane = User(
            email="jane@example.com",
            display_name="Jane",
            hashed_password=get_password_hash("password123"),
        )
        db.add_all([andrew, jane])
        await db.flush()

        group = Group(name="Household", created_by=andrew.id)
        db.add(group)
        await db.flush()
        db.add_all(
            [
                GroupMember(group_id=group.id, user_id=andrew.id, role="owner"),
                GroupMember(group_id=group.id, user_id=jane.id, role="member", invited_by=andrew.id),
            ]
        )

        entry = ManualEntry(
            group_id=group.id,
            created_by=andrew.id,
            description="Groceries",
            total_amount=Decimal("20.00"),
            split_type="equal",
        )
        db.add(entry)
        await db.flush()
        db.add_all(
            [
                ManualEntrySplit(manual_entry_id=entry.id, user_id=andrew.id, amount=Decimal("10.00")),
                ManualEntrySplit(manual_entry_id=entry.id, user_id=jane.id, amount=Decimal("10.00")),
            ]
        )
        db.add(
            Settlement(
                group_id=group.id,
                paid_by=jane.id,
                paid_to=andrew.id,
                amount=Decimal("9.34"),
                notes="Seed settlement sample",
            )
        )
        await db.commit()


if __name__ == "__main__":
    asyncio.run(run())
