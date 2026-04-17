from decimal import Decimal

from app.api.routes.receipts import _positive_ocr_items
from app.schemas.ocr import OCRLineItemExtracted


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
