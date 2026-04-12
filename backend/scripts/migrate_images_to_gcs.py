"""One-time script to migrate existing images from PostgreSQL to GCS.

Run after deploying the 0008_gcs_migration schema migration and before
running the 0009_gcs_cleanup migration.

Usage:
    cd backend
    python scripts/migrate_images_to_gcs.py

The script is idempotent — safe to re-run if interrupted.
"""

import asyncio
import base64
import logging
import os
import sys

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

# Allow running from the backend directory
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.core.settings import get_settings  # noqa: E402
from app.services.gcs import GCSService  # noqa: E402

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

BATCH_SIZE = 50


async def migrate_receipts(session: AsyncSession, gcs: GCSService, folder: str) -> None:
    """Backfill image_gcs_path for receipts that still have image_data in the DB."""
    # Use raw SQL to access image_data which may have been removed from the ORM model
    result = await session.execute(
        text(
            "SELECT id, image_data FROM receipts "
            "WHERE image_gcs_path IS NULL AND image_data IS NOT NULL"
        )
    )
    rows = result.fetchall()
    total = len(rows)
    logger.info("Receipts to migrate: %d", total)

    for n, (receipt_id, image_data) in enumerate(rows, start=1):
        object_name = f"{receipt_id}.jpg"
        gcs_path = gcs.upload_image(folder, object_name, bytes(image_data), "image/jpeg")
        if gcs_path is None:
            logger.error("Failed to upload receipt %s, skipping", receipt_id)
            continue
        await session.execute(
            text("UPDATE receipts SET image_gcs_path = :path WHERE id = :id"),
            {"path": gcs_path, "id": str(receipt_id)},
        )
        if n % BATCH_SIZE == 0:
            await session.commit()
            logger.info("Receipts: committed batch (%d/%d)", n, total)

    await session.commit()
    logger.info("Receipts migration complete (%d/%d)", total, total)


async def migrate_users(session: AsyncSession, gcs: GCSService, folder: str) -> None:
    """Backfill user profile pictures stored as base64 data URLs to GCS.
    Uses raw SQL because this script runs before migration 0010 renames the column.
    """
    result = await session.execute(
        text("SELECT id, profile_picture FROM users WHERE profile_picture IS NOT NULL")
    )
    rows = result.fetchall()

    total = 0
    skipped = 0
    for user_id, pic in rows:
        if not pic or not pic.startswith("data:"):
            skipped += 1
            continue  # Already a GCS path or null
        try:
            raw_b64 = pic.split(",", 1)[1]
            decoded = base64.b64decode(raw_b64)
        except Exception as e:
            logger.warning("Skipping user %s — could not decode profile picture: %s", user_id, e)
            skipped += 1
            continue
        gcs_path = gcs.upload_image(folder, f"{user_id}.jpg", decoded, "image/jpeg")
        if gcs_path is None:
            logger.error("Failed to upload profile picture for user %s, skipping", user_id)
            continue
        await session.execute(
            text("UPDATE users SET profile_picture = :path WHERE id = :id"),
            {"path": gcs_path, "id": str(user_id)},
        )
        total += 1
        if total % BATCH_SIZE == 0:
            await session.commit()
            logger.info("Users: committed batch (%d migrated)", total)

    await session.commit()
    logger.info("Users migration complete (%d migrated, %d skipped)", total, skipped)


async def migrate_groups(session: AsyncSession, gcs: GCSService, folder: str) -> None:
    """Backfill group profile pictures stored as base64 data URLs to GCS.
    Uses raw SQL because this script runs before migration 0010 renames the column.
    """
    result = await session.execute(
        text("SELECT id, profile_picture FROM groups WHERE profile_picture IS NOT NULL")
    )
    rows = result.fetchall()

    total = 0
    skipped = 0
    for group_id, pic in rows:
        if not pic or not pic.startswith("data:"):
            skipped += 1
            continue  # Already a GCS path or null
        try:
            raw_b64 = pic.split(",", 1)[1]
            decoded = base64.b64decode(raw_b64)
        except Exception as e:
            logger.warning("Skipping group %s — could not decode profile picture: %s", group_id, e)
            skipped += 1
            continue
        gcs_path = gcs.upload_image(folder, f"{group_id}.jpg", decoded, "image/jpeg")
        if gcs_path is None:
            logger.error("Failed to upload profile picture for group %s, skipping", group_id)
            continue
        await session.execute(
            text("UPDATE groups SET profile_picture = :path WHERE id = :id"),
            {"path": gcs_path, "id": str(group_id)},
        )
        total += 1
        if total % BATCH_SIZE == 0:
            await session.commit()
            logger.info("Groups: committed batch (%d migrated)", total)

    await session.commit()
    logger.info("Groups migration complete (%d migrated, %d skipped)", total, skipped)


async def main() -> None:
    settings = get_settings()
    gcs = GCSService()
    if not gcs.is_available():
        logger.error(
            "GCS service is not available — check GCP_SERVICE_ACCOUNT_CREDENTIALS "
            "and GCS_IMAGES_BUCKET_NAME"
        )
        sys.exit(1)

    engine = create_async_engine(settings.database_url, echo=False)
    AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    async with AsyncSessionLocal() as session:
        logger.info("Starting image migration to GCS bucket: %s", settings.gcs_images_bucket_name)
        await migrate_receipts(session, gcs, settings.receipts_image_folder)
        await migrate_users(session, gcs, settings.user_profile_image_folder)
        await migrate_groups(session, gcs, settings.group_profile_image_folder)

    await engine.dispose()
    logger.info("Migration complete")


if __name__ == "__main__":
    asyncio.run(main())
