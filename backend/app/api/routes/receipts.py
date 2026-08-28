import asyncio
import base64
import uuid
from decimal import ROUND_HALF_UP, Decimal

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile
from fastapi.responses import Response
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, require_group_member
from app.core.settings import get_settings
from app.db.session import get_db
from app.models.enums import ShareType
from app.models.group_member import GroupMember
from app.models.line_item import ItemAssignment, LineItem
from app.models.receipt import Receipt, effective_receipt_image_paths
from app.models.user import User
from app.schemas.receipts import (
    OCRLineItemOut,
    ReceiptAssignRequest,
    ReceiptOut,
    ReceiptPatchRequest,
    ReceiptShareLineOut,
    ReceiptShareOut,
    ReceiptUpdateItemsRequest,
)
from app.services.gcs import GCSService, get_gcs_service
from app.services.receipt_images import signed_urls_for_receipt, signed_urls_for_receipts
from app.services.mark_paid import (
    build_receipt_share_lines,
    create_receipt_mark_paid,
    delete_receipt_mark_paid,
    get_paid_map,
    get_receipt_share_totals,
    receipt_has_linked_settlements,
    receipt_mark_paid_flags,
)
from app.services.ocr import extract_receipt_items, image_bytes_to_jpeg_bytes

router = APIRouter(tags=["receipts"])


def _round(value: Decimal) -> Decimal:
    return value.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)


def _make_receipt_out(receipt: Receipt, gcs: GCSService) -> ReceiptOut:
    urls = signed_urls_for_receipt(receipt, gcs)
    return ReceiptOut.model_validate(receipt).model_copy(update={"image_urls": urls})


def _make_receipt_outs(receipts: list[Receipt], gcs: GCSService) -> list[ReceiptOut]:
    urls_by_id = signed_urls_for_receipts(receipts, gcs)
    return [
        ReceiptOut.model_validate(receipt).model_copy(
            update={"image_urls": urls_by_id.get(receipt.id, [])}
        )
        for receipt in receipts
    ]


def _effective_amount(item_in) -> Decimal:
    """Return the line amount to use for ItemAssignment: final_line_total if provided, else amount."""
    if item_in.final_line_total is not None:
        return Decimal(str(item_in.final_line_total))
    return Decimal(str(item_in.amount))


def _positive_ocr_items(items):
    """Yield (sort_order, item, final_line_total) for OCR items with a positive final_line_total.

    Free / complimentary / zero-priced lines are excluded at the OCR prompt stage, but this
    filter enforces the same rule defensively so the DB's `amount > 0` check can never be hit.
    sort_order is re-indexed across the surviving items so the persisted sequence is contiguous.
    """
    sort_index = 0
    for item in items:
        final_total = Decimal(str(item.final_line_total))
        if final_total <= 0:
            continue
        yield sort_index, item, final_total
        sort_index += 1


async def _get_receipt_for_group(
    db: AsyncSession, group_id: uuid.UUID, receipt_id: uuid.UUID
) -> Receipt:
    receipt = await db.get(Receipt, receipt_id)
    if not receipt or receipt.group_id != group_id:
        raise HTTPException(status_code=404, detail="Receipt not found")
    return receipt


async def _serialize_receipt_share(
    db: AsyncSession,
    receipt: Receipt,
    current_user_id: uuid.UUID,
) -> ReceiptShareOut:
    share_totals_map = await get_receipt_share_totals(db, [receipt.id])
    share_totals = share_totals_map.get(receipt.id, {})
    paid_map = await get_paid_map(db, receipt_ids=[receipt.id])
    members = (
        await db.scalars(select(GroupMember).where(GroupMember.group_id == receipt.group_id))
    ).all()
    user_ids = {m.user_id for m in members} | set(share_totals.keys())
    users = (await db.scalars(select(User).where(User.id.in_(user_ids)))).all() if user_ids else []
    display_name_map = {u.id: u.display_name for u in users}
    lines = build_receipt_share_lines(receipt, share_totals, display_name_map, paid_map)
    can_mark_paid, my_share_amount = receipt_mark_paid_flags(
        receipt, share_totals, current_user_id, paid_map
    )
    return ReceiptShareOut(
        id=receipt.id,
        group_id=receipt.group_id,
        nickname=receipt.nickname,
        merchant_name=receipt.merchant_name,
        total_amount=receipt.total_amount,
        currency=receipt.currency,
        paid_by_user_id=receipt.paid_by_user_id,
        status=receipt.status.value if hasattr(receipt.status, "value") else str(receipt.status),
        splits=[ReceiptShareLineOut(**line) for line in lines],
        can_mark_paid=can_mark_paid,
        my_share_amount=my_share_amount,
    )


@router.post("/groups/{group_id}/receipts", response_model=ReceiptOut, status_code=201)
async def upload_receipt(
    group_id: uuid.UUID,
    files: list[UploadFile] = File(...),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    await require_group_member(group_id, user, db)
    if not files:
        raise HTTPException(status_code=400, detail="At least one file is required")

    images_base64: list[str] = []
    jpeg_bodies: list[bytes] = []

    for upload in files:
        body = await upload.read()
        if len(body) > 10 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large (max 10 MB per file)")
        content_type = upload.content_type or ""
        jpeg_body = image_bytes_to_jpeg_bytes(body, content_type)
        jpeg_bodies.append(jpeg_body)
        images_base64.append(base64.b64encode(jpeg_body).decode())

    if not jpeg_bodies:
        raise HTTPException(status_code=400, detail="At least one file is required")

    receipt_id = uuid.uuid4()
    settings = get_settings()
    gcs_paths: list[str] = []
    for i, jpeg_body in enumerate(jpeg_bodies):
        gcs_path = await asyncio.to_thread(
            gcs.upload_image,
            settings.receipts_image_folder,
            f"{receipt_id}_{i}.jpg",
            jpeg_body,
            "image/jpeg",
        )
        if gcs_path is None:
            raise HTTPException(status_code=500, detail="Failed to upload receipt image")
        gcs_paths.append(gcs_path)

    receipt = Receipt(
        id=receipt_id,
        group_id=group_id,
        uploaded_by=user.id,
        image_gcs_path=gcs_paths[0],
        image_gcs_paths=gcs_paths,
        status="pending_ocr",
    )
    db.add(receipt)
    await db.flush()  # persist receipt row so LineItem FK references are valid

    try:
        parsed = await extract_receipt_items(images_base64)
        receipt.merchant_name = parsed.merchant_name
        receipt.currency = parsed.currency
        if parsed.total_amount is not None:
            receipt.total_amount = Decimal(str(parsed.total_amount))
        receipt.ocr_raw_response = parsed.model_dump(mode="json")
        receipt.status = "pending_review"
        for sort_index, item, final_total in _positive_ocr_items(parsed.items):
            db.add(
                LineItem(
                    receipt_id=receipt.id,
                    group_id=group_id,
                    description=item.description,
                    amount=final_total,
                    uncertain=item.confidence < 0.85,
                    sort_order=sort_index,
                    quantity=item.quantity,
                    price_per_unit=Decimal(str(item.price_per_unit)),
                    line_subtotal=Decimal(str(item.line_subtotal)),
                    line_discount=Decimal(str(item.line_discount)),
                    final_line_total=final_total,
                    confidence=item.confidence,
                )
            )
    except Exception as exc:  # noqa: BLE001
        receipt.status = "ocr_failed"
        receipt.ocr_error = str(exc)
    await db.commit()
    await db.refresh(receipt)
    return await asyncio.to_thread(_make_receipt_out, receipt, gcs)


@router.get("/receipts/{receipt_id}", response_model=ReceiptOut)
async def get_receipt(
    receipt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    receipt = await db.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    await require_group_member(receipt.group_id, user, db)
    return await asyncio.to_thread(_make_receipt_out, receipt, gcs)


@router.patch("/receipts/{receipt_id}", response_model=ReceiptOut)
async def patch_receipt(
    receipt_id: uuid.UUID,
    payload: ReceiptPatchRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    receipt = await db.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    await require_group_member(receipt.group_id, user, db)

    if payload.nickname is not None:
        receipt.nickname = payload.nickname or None
    if payload.merchant_name is not None:
        receipt.merchant_name = payload.merchant_name or None
    if payload.total_amount is not None:
        receipt.total_amount = payload.total_amount
    if payload.currency is not None:
        receipt.currency = payload.currency or None

    await db.commit()
    await db.refresh(receipt)
    return await asyncio.to_thread(_make_receipt_out, receipt, gcs)


@router.get("/receipts/{receipt_id}/items", response_model=list[OCRLineItemOut])
async def get_receipt_items(
    receipt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    receipt = await db.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    await require_group_member(receipt.group_id, user, db)
    rows = (
        await db.scalars(
            select(LineItem)
            .where(LineItem.receipt_id == receipt_id)
            .order_by(LineItem.sort_order)
        )
    ).all()

    # Fetch assignments and build assignee map
    item_ids = [row.id for row in rows]
    assignee_map: dict[uuid.UUID, str | None] = {}
    if item_ids:
        assignments = (
            await db.scalars(select(ItemAssignment).where(ItemAssignment.line_item_id.in_(item_ids)))
        ).all()
        by_item: dict[uuid.UUID, list[ItemAssignment]] = {}
        for a in assignments:
            by_item.setdefault(a.line_item_id, []).append(a)
        for item_id, item_assignments in by_item.items():
            if len(item_assignments) == 1 and item_assignments[0].share_type == ShareType.full:
                assignee_map[item_id] = str(item_assignments[0].user_id)
            else:
                assignee_map[item_id] = None

    out = []
    for row in rows:
        item_out = OCRLineItemOut.model_validate(row)
        item_out.assignee = assignee_map.get(row.id)
        out.append(item_out)
    return out


@router.put("/receipts/{receipt_id}/items", response_model=ReceiptOut)
async def update_receipt_items(
    receipt_id: uuid.UUID,
    payload: ReceiptUpdateItemsRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    receipt = await db.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    await require_group_member(receipt.group_id, user, db)
    if receipt.status not in ("pending_review", "confirmed", "assigned"):
        raise HTTPException(status_code=400, detail="Receipt not editable in current state")
    if await receipt_has_linked_settlements(db, receipt.id):
        raise HTTPException(
            status_code=409,
            detail="Cannot change items after someone marked this receipt as paid",
        )

    await db.execute(delete(LineItem).where(LineItem.receipt_id == receipt.id))
    for index, item in enumerate(payload.items):
        effective = _effective_amount(item)
        db.add(
            LineItem(
                receipt_id=receipt.id,
                group_id=receipt.group_id,
                description=item.description,
                amount=effective,
                uncertain=False,
                sort_order=index,
                quantity=item.quantity,
                price_per_unit=item.price_per_unit,
                line_subtotal=item.line_subtotal,
                line_discount=item.line_discount,
                final_line_total=item.final_line_total if item.final_line_total is not None else effective,
            )
        )
    if receipt.status == "pending_review":
        receipt.status = "confirmed"
    receipt.version += 1
    await db.commit()
    await db.refresh(receipt)
    return await asyncio.to_thread(_make_receipt_out, receipt, gcs)


@router.post("/receipts/{receipt_id}/assign", response_model=ReceiptOut)
async def assign_receipt(
    receipt_id: uuid.UUID,
    payload: ReceiptAssignRequest,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    receipt = await db.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    await require_group_member(receipt.group_id, user, db)
    if receipt.status not in ("confirmed", "assigned"):
        raise HTTPException(status_code=400, detail="Receipt must be confirmed before assignment")
    if await receipt_has_linked_settlements(db, receipt.id):
        raise HTTPException(
            status_code=409,
            detail="Cannot reassign after someone marked this receipt as paid",
        )

    members = (await db.scalars(select(GroupMember).where(GroupMember.group_id == receipt.group_id))).all()
    member_id_set = {member.user_id for member in members}

    line_items = (await db.scalars(select(LineItem).where(LineItem.receipt_id == receipt.id))).all()
    line_item_ids = {line_item.id for line_item in line_items}
    payload_ids = {assignment.line_item_id for assignment in payload.assignments}
    if payload_ids != line_item_ids:
        raise HTTPException(status_code=400, detail="Assignments must include all line items exactly once")

    await db.execute(
        delete(ItemAssignment).where(
            ItemAssignment.line_item_id.in_(list(line_item_ids))
        )
    )
    by_id = {line_item.id: line_item for line_item in line_items}
    for assignment in payload.assignments:
        item = by_id[assignment.line_item_id]
        if len(assignment.shares) == 1 and assignment.shares[0].share_type == "full":
            if assignment.shares[0].user_id not in member_id_set:
                raise HTTPException(status_code=400, detail="Assigned user must be a group member")
            db.add(
                ItemAssignment(
                    line_item_id=item.id,
                    user_id=assignment.shares[0].user_id,
                    share_type="full",
                    share_amount=item.amount,
                )
            )
        else:
            # Equal split among the users listed in shares
            equal_users = sorted(
                [s.user_id for s in assignment.shares if s.share_type == "equal"],
                key=lambda v: str(v),
            )
            if not equal_users:
                raise HTTPException(status_code=400, detail="Equal split requires at least one user")
            if any(uid not in member_id_set for uid in equal_users):
                raise HTTPException(status_code=400, detail="Assigned users must be group members")
            n = len(equal_users)
            per_person = _round(item.amount / Decimal(str(n)))
            running = Decimal("0")
            for i, uid in enumerate(equal_users):
                if i < n - 1:
                    share = per_person
                    running += share
                else:
                    share = item.amount - running
                db.add(
                    ItemAssignment(
                        line_item_id=item.id,
                        user_id=uid,
                        share_type="equal",
                        share_amount=share,
                    )
                )
    receipt.status = "assigned"
    receipt.paid_by_user_id = payload.paid_by
    receipt.version += 1
    await db.commit()
    await db.refresh(receipt)
    return await asyncio.to_thread(_make_receipt_out, receipt, gcs)


@router.delete("/receipts/{receipt_id}", status_code=204)
async def delete_receipt(
    receipt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    receipt = await db.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    await require_group_member(receipt.group_id, user, db)
    for path in effective_receipt_image_paths(receipt):
        await asyncio.to_thread(gcs.delete_image, path)
    await db.delete(receipt)
    await db.commit()


@router.get("/receipts/{receipt_id}/image")
async def receipt_image(
    receipt_id: uuid.UUID,
    index: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    receipt = await db.get(Receipt, receipt_id)
    if not receipt:
        raise HTTPException(status_code=404, detail="Receipt not found")
    await require_group_member(receipt.group_id, user, db)

    paths = effective_receipt_image_paths(receipt)
    if not paths or index >= len(paths):
        raise HTTPException(status_code=404, detail="Receipt image not found")
    image_bytes = await asyncio.to_thread(gcs.download_image, paths[index])
    if image_bytes is None:
        raise HTTPException(status_code=404, detail="Receipt image not found")
    return Response(
        content=image_bytes,
        media_type="image/jpeg",
        headers={"Cache-Control": "private, max-age=86400"},
    )


@router.get("/groups/{group_id}/receipts", response_model=list[ReceiptOut])
async def list_group_receipts(
    group_id: uuid.UUID,
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
    gcs: GCSService = Depends(get_gcs_service),
):
    await require_group_member(group_id, user, db)
    query = select(Receipt).where(Receipt.group_id == group_id).order_by(Receipt.created_at.desc())
    if status:
        query = query.where(Receipt.status == status)
    rows = (await db.scalars(query)).all()
    return await asyncio.to_thread(_make_receipt_outs, list(rows), gcs)


@router.post("/groups/{group_id}/receipts/{receipt_id}/mark-paid", response_model=ReceiptShareOut)
async def mark_receipt_paid(
    group_id: uuid.UUID,
    receipt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    receipt = await _get_receipt_for_group(db, group_id, receipt_id)
    await create_receipt_mark_paid(db, group_id, receipt, user.id)
    return await _serialize_receipt_share(db, receipt, user.id)


@router.delete("/groups/{group_id}/receipts/{receipt_id}/mark-paid", response_model=ReceiptShareOut)
async def unmark_receipt_paid(
    group_id: uuid.UUID,
    receipt_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    user: User = Depends(get_current_user),
):
    await require_group_member(group_id, user, db)
    receipt = await _get_receipt_for_group(db, group_id, receipt_id)
    await delete_receipt_mark_paid(db, group_id, receipt, user.id)
    return await _serialize_receipt_share(db, receipt, user.id)
