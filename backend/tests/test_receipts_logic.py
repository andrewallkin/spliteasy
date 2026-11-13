from decimal import Decimal

from app.api.routes.receipts import _positive_ocr_items
from app.schemas.ocr import OCRLineItemExtracted, ReceiptOCRResult
from app.services.receipt_math import (
    build_retry_user_content,
    prefer_attempt,
    reconcile_receipt,
)


def _item(description: str, final_line_total: str) -> OCRLineItemExtracted:
    return OCRLineItemExtracted(
        description=description,
        quantity=1,
        price_per_unit=final_line_total,
        line_subtotal=final_line_total,
        line_discount="0.00",
        final_line_total=final_line_total,
        confidence=0.9,
    )


def test_positive_ocr_items_skips_free_line() -> None:
    items = [
        _item("COMBO 3", "159.00"),
        _item("COMBO 7", "159.00"),
        _item("FREE COMBO 8", "0.00"),
        _item("GODZILLA ROLL -4PC", "78.00"),
    ]

    kept = list(_positive_ocr_items(items))

    assert [item.description for _, item, _ in kept] == [
        "COMBO 3",
        "COMBO 7",
        "GODZILLA ROLL -4PC",
    ]
    assert [final for _, _, final in kept] == [
        Decimal("159.00"),
        Decimal("159.00"),
        Decimal("78.00"),
    ]


def test_positive_ocr_items_reindexes_sort_order_contiguously() -> None:
    items = [
        _item("FREE WATER", "0.00"),
        _item("BURGER", "85.00"),
        _item("PROMO SIDE", "0.00"),
        _item("FRIES", "35.00"),
    ]

    kept = list(_positive_ocr_items(items))

    assert [sort_order for sort_order, _, _ in kept] == [0, 1]
    assert [item.description for _, item, _ in kept] == ["BURGER", "FRIES"]


def test_positive_ocr_items_skips_negative_amounts() -> None:
    items = [
        _item("PAID", "10.00"),
        _item("WEIRD NEGATIVE", "-5.00"),
    ]

    kept = list(_positive_ocr_items(items))

    assert [item.description for _, item, _ in kept] == ["PAID"]


def test_positive_ocr_items_empty_input() -> None:
    assert list(_positive_ocr_items([])) == []


def _receipt(items: list[OCRLineItemExtracted], total: str = "100.00") -> ReceiptOCRResult:
    return ReceiptOCRResult(
        merchant_name="Checkers",
        currency="ZAR",
        total_amount=total,
        items=items,
    )


def test_reconcile_infers_missed_discount_and_lowers_confidence() -> None:
    receipt = _receipt(
        [
            OCRLineItemExtracted(
                description="T/BRUSH WHT MED",
                quantity=2,
                price_per_unit="44.99",
                line_subtotal="89.98",
                line_discount="0.00",
                final_line_total="62.98",
                confidence=0.9,
            )
        ],
        total="62.98",
    )

    reconciled = reconcile_receipt(receipt)
    item = reconciled.result.items[0]

    assert item.line_discount == "27.00"
    assert item.final_line_total == "62.98"
    assert item.line_subtotal == "89.98"
    assert item.confidence == 0.5
    assert reconciled.needs_retry is False
    assert reconciled.rewrites[0].description == "T/BRUSH WHT MED"


def test_reconcile_raises_default_confidence_so_rewritten_line_is_visible() -> None:
    receipt = _receipt(
        [
            OCRLineItemExtracted(
                description="MILK",
                quantity=1,
                price_per_unit="20.00",
                line_subtotal="20.00",
                line_discount="0.00",
                final_line_total="15.00",
                confidence=0.0,
            )
        ],
        total="15.00",
    )

    item = reconcile_receipt(receipt).result.items[0]

    assert item.line_discount == "5.00"
    assert item.confidence == 0.5


def test_reconcile_applies_discount_when_final_matches_subtotal() -> None:
    receipt = _receipt(
        [
            OCRLineItemExtracted(
                description="T/BRUSH WHT MED",
                quantity=2,
                price_per_unit="44.99",
                line_subtotal="89.98",
                line_discount="27.00",
                final_line_total="89.98",
                confidence=0.9,
            )
        ],
        total="62.98",
    )

    item = reconcile_receipt(receipt).result.items[0]

    assert item.final_line_total == "62.98"
    assert item.line_discount == "27.00"
    assert item.confidence == 0.5


def test_reconcile_derives_unit_price_from_subtotal() -> None:
    receipt = _receipt(
        [
            OCRLineItemExtracted(
                description="APPLES",
                quantity=2,
                price_per_unit="10.00",
                line_subtotal="89.98",
                line_discount="0.00",
                final_line_total="89.98",
                confidence=0.9,
            )
        ],
        total="89.98",
    )

    item = reconcile_receipt(receipt).result.items[0]

    assert item.price_per_unit == "44.99"
    assert item.line_subtotal == "89.98"
    assert item.final_line_total == "89.98"


def test_reconcile_flips_negative_discount_to_a_magnitude() -> None:
    receipt = _receipt(
        [
            OCRLineItemExtracted(
                description="CEREAL",
                quantity=1,
                price_per_unit="89.98",
                line_subtotal="89.98",
                line_discount="-27.00",
                final_line_total="62.98",
                confidence=0.9,
            )
        ],
        total="62.98",
    )

    item = reconcile_receipt(receipt).result.items[0]

    assert item.line_discount == "27.00"
    assert item.final_line_total == "62.98"


def test_reconcile_trusts_payable_total_when_final_exceeds_subtotal() -> None:
    receipt = _receipt(
        [
            OCRLineItemExtracted(
                description="BREAD",
                quantity=1,
                price_per_unit="10.00",
                line_subtotal="10.00",
                line_discount="2.00",
                final_line_total="15.00",
                confidence=0.9,
            )
        ],
        total="15.00",
    )

    item = reconcile_receipt(receipt).result.items[0]

    assert item.final_line_total == "15.00"
    assert item.line_subtotal == "15.00"
    assert item.line_discount == "0.00"
    assert item.price_per_unit == "15.00"


def test_reconcile_leaves_printed_total_when_lines_do_not_sum() -> None:
    receipt = _receipt(
        [
            _item("MILK", "10.00"),
            _item("BREAD", "5.00"),
        ],
        total="20.00",
    )

    reconciled = reconcile_receipt(receipt)

    assert reconciled.result.total_amount == "20.00"
    assert reconciled.items_total == Decimal("15.00")
    assert reconciled.sum_gap == Decimal("-5.00")
    assert reconciled.needs_retry is True


def test_reconcile_ignores_zero_lines_in_the_sum_and_persistence_still_drops_them() -> None:
    receipt = _receipt(
        [
            _item("BURGER", "85.00"),
            _item("FREE WATER", "0.00"),
        ],
        total="85.00",
    )

    reconciled = reconcile_receipt(receipt)
    kept = list(_positive_ocr_items(reconciled.result.items))

    assert reconciled.items_total == Decimal("85.00")
    assert reconciled.needs_retry is False
    assert [item.description for _, item, _ in kept] == ["BURGER"]


def test_balanced_receipt_does_not_need_a_second_call() -> None:
    reconciled = reconcile_receipt(_receipt([_item("MILK", "10.00")], total="10.00"))

    assert reconciled.needs_retry is False
    assert reconciled.sum_gap == Decimal("0.00")


def test_prefer_attempt_keeps_the_smaller_gap_and_ties_go_to_the_second() -> None:
    wider = reconcile_receipt(_receipt([_item("A", "10.00")], total="20.00"))
    closer = reconcile_receipt(_receipt([_item("A", "18.00")], total="20.00"))
    same_gap = reconcile_receipt(_receipt([_item("B", "10.00")], total="20.00"))

    assert prefer_attempt(wider, closer).result.items[0].final_line_total == "18.00"
    assert prefer_attempt(closer, wider).result.items[0].final_line_total == "18.00"
    assert prefer_attempt(wider, same_gap).result.items[0].description == "B"


def test_retry_prompt_includes_images_prior_json_and_the_gap() -> None:
    prior = _receipt([_item("MILK", "10.00")], total="20.00")
    report = reconcile_receipt(prior)

    content = build_retry_user_content(["abc123"], prior, report)
    text = content[0]["text"]

    assert "10.00" in text
    assert "20.00" in text
    assert "-10.00" in text
    assert "MILK" in text
    assert "printed GROSS" in text
    assert content[1]["type"] == "image_url"
    assert content[1]["image_url"]["url"] == "data:image/jpeg;base64,abc123"
