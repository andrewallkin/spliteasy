"""Deterministic receipt arithmetic after structured OCR."""

from __future__ import annotations

from dataclasses import dataclass
from decimal import ROUND_HALF_UP, Decimal

from app.schemas.ocr import OCRLineItemExtracted, ReceiptOCRResult

CENT = Decimal("0.01")


def money(value: object) -> Decimal:
    return Decimal(str(value)).quantize(CENT, rounding=ROUND_HALF_UP)


def _text(value: Decimal) -> str:
    return f"{value:.2f}"


@dataclass(frozen=True)
class LineRewrite:
    description: str
    detail: str


@dataclass(frozen=True)
class ReconciledReceipt:
    result: ReceiptOCRResult
    rewrites: tuple[LineRewrite, ...]
    items_total: Decimal
    printed_total: Decimal
    sum_gap: Decimal
    needs_retry: bool


@dataclass(frozen=True)
class ReceiptExtraction:
    result: ReceiptOCRResult
    retried: bool
    sum_gap: Decimal


def _reconcile_item(item: OCRLineItemExtracted) -> tuple[OCRLineItemExtracted, str | None]:
    qty = item.quantity if item.quantity > 0 else 1
    price = money(item.price_per_unit)
    subtotal = money(item.line_subtotal)
    raw_discount = money(item.line_discount)
    discount = abs(raw_discount)
    final = money(item.final_line_total)
    notes: list[str] = []

    if qty != item.quantity:
        notes.append("quantity set to 1")

    if discount != raw_discount:
        notes.append("line_discount stored as a positive amount")

    if abs(money(price * qty) - subtotal) > CENT:
        price = money(subtotal / Decimal(qty))
        notes.append("price_per_unit set from line_subtotal / quantity")

    equation = money(subtotal - discount)
    if abs(final - equation) <= CENT:
        pass
    elif final > subtotal + CENT:
        subtotal = final
        discount = Decimal("0.00")
        price = money(subtotal / Decimal(qty))
        notes.append("line reset to the payable final_line_total")
    elif discount <= CENT and final + CENT < subtotal:
        discount = money(subtotal - final)
        notes.append("line_discount set so line_subtotal minus discount equals final_line_total")
    elif abs(final - subtotal) <= CENT and discount > CENT:
        final = money(subtotal - discount)
        notes.append("final_line_total set to line_subtotal minus line_discount")
    else:
        discount = money(max(Decimal("0.00"), subtotal - final))
        notes.append("line_discount set to match final_line_total")

    moved = (
        abs(price - money(item.price_per_unit)) > CENT
        or abs(subtotal - money(item.line_subtotal)) > CENT
        or abs(discount - money(item.line_discount)) > CENT
        or abs(final - money(item.final_line_total)) > CENT
        or qty != item.quantity
    )
    confidence = item.confidence
    if moved and (confidence == 0 or confidence > 0.5):
        confidence = 0.5

    updated = item.model_copy(
        update={
            "quantity": qty,
            "price_per_unit": _text(price),
            "line_subtotal": _text(subtotal),
            "line_discount": _text(discount),
            "final_line_total": _text(final),
            "confidence": confidence,
        }
    )
    detail = "; ".join(notes) if notes else None
    return updated, detail


def reconcile_receipt(result: ReceiptOCRResult) -> ReconciledReceipt:
    items: list[OCRLineItemExtracted] = []
    rewrites: list[LineRewrite] = []
    for item in result.items:
        updated, detail = _reconcile_item(item)
        items.append(updated)
        if detail:
            rewrites.append(LineRewrite(description=updated.description, detail=detail))

    items_total = sum(
        (money(item.final_line_total) for item in items if money(item.final_line_total) > 0),
        Decimal("0.00"),
    )
    items_total = money(items_total)
    printed_total = money(result.total_amount)
    sum_gap = money(items_total - printed_total)
    return ReconciledReceipt(
        result=result.model_copy(update={"items": items}),
        rewrites=tuple(rewrites),
        items_total=items_total,
        printed_total=printed_total,
        sum_gap=sum_gap,
        needs_retry=abs(sum_gap) > CENT,
    )


def prefer_attempt(first: ReconciledReceipt, second: ReconciledReceipt) -> ReconciledReceipt:
    if abs(second.sum_gap) <= abs(first.sum_gap):
        return second
    return first


def build_retry_user_content(
    images_base64: list[str],
    prior: ReceiptOCRResult,
    report: ReconciledReceipt,
) -> list[dict]:
    if report.rewrites:
        rewrite_lines = "\n".join(f"- {row.description}: {row.detail}" for row in report.rewrites)
    else:
        rewrite_lines = "- No per-line fields were rewritten."
    text = (
        "The previous extraction does not add up.\n\n"
        "Previous JSON:\n"
        f"{prior.model_dump_json()}\n\n"
        "Check report:\n"
        f"{rewrite_lines}\n"
        f"Items total {_text(report.items_total)}, printed total {_text(report.printed_total)}, "
        f"difference {_text(report.sum_gap)}.\n\n"
        "Return a full ReceiptOCRResult. Keep total_amount as the printed GROSS "
        f"({_text(report.printed_total)}). Fix the lines — a missing line, a duplicate line, "
        "or a discount on the wrong item — so the sum of final_line_total equals that total."
    )
    content: list[dict] = [{"type": "text", "text": text}]
    for encoded in images_base64:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
            }
        )
    return content
