from app.schemas.ocr import OCRLineItemExtracted, OCRReadRow, ReceiptOCRRead, ReceiptOCRResult
from app.services.currency import normalize_currency
from app.services.promo_allocation import settle_receipt


def test_rand_symbol_becomes_zar() -> None:
    assert normalize_currency("R") == "ZAR"
    assert normalize_currency(" rand ") == "ZAR"
    assert normalize_currency("") == "ZAR"
    assert normalize_currency(None) == "ZAR"
    assert normalize_currency("usd") == "USD"


def test_ocr_read_stores_an_iso_code() -> None:
    read = ReceiptOCRRead(
        merchant_name="Checkers",
        currency="R",
        total_amount="10.00",
        rows=[
            OCRReadRow(
                kind="product",
                description="Milk",
                quantity=1,
                price_per_unit="10.00",
                amount="10.00",
                promo_quantity=0,
                promo_price="0.00",
                promo_percent="0.00",
            )
        ],
    )
    assert read.currency == "ZAR"
    settled = settle_receipt(read)
    assert settled.result.currency == "ZAR"


def test_ocr_result_rejects_a_blank_currency() -> None:
    result = ReceiptOCRResult(
        currency=" ",
        total_amount="1.00",
        items=[
            OCRLineItemExtracted(
                description="Milk",
                price_per_unit="1.00",
                line_subtotal="1.00",
                final_line_total="1.00",
            )
        ],
    )
    assert result.currency == "ZAR"
