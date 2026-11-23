from decimal import Decimal

from app.schemas.ocr import OCRReadRow, ReceiptOCRRead
from app.services.promo_allocation import settle_receipt


def _row(
    kind: str,
    description: str,
    amount: str,
    quantity: int = 1,
    price_per_unit: str = "0.00",
    promo_quantity: int = 0,
    promo_price: str = "0.00",
    promo_percent: str = "0.00",
) -> OCRReadRow:
    return OCRReadRow(
        kind=kind,  # type: ignore[arg-type]
        description=description,
        quantity=quantity,
        price_per_unit=price_per_unit,
        amount=amount,
        promo_quantity=promo_quantity,
        promo_price=promo_price,
        promo_percent=promo_percent,
    )


def _product(description: str, quantity: int, unit: str, amount: str) -> OCRReadRow:
    return _row("product", description, amount, quantity=quantity, price_per_unit=unit)


def _read(rows: list[OCRReadRow], total: str) -> ReceiptOCRRead:
    return ReceiptOCRRead(merchant_name="Checkers", currency="ZAR", total_amount=total, rows=rows)


def test_sixty60_promos_attach_to_the_lines_above_and_match_the_printed_total() -> None:
    read = _read(
        [
            _product(
                "Rhodes Quality Extra Fruit Strawberry Blueberry Jam 340g",
                1,
                "64.99",
                "64.99",
            ),
            _product("Rhodes Quality Ruby Grapefruit Marmalade 340g", 1, "64.99", "64.99"),
            _row("promo", "Buy 2 For R99", "30.98", promo_quantity=2, promo_price="99.00"),
            _product("Castello Brie 125g", 1, "59.99", "59.99"),
            _product("Coca-Cola Zero Sugar Soft Drink 2L", 2, "19.99", "39.98"),
            _row("promo", "Buy 2 For R30", "9.98", promo_quantity=2, promo_price="30.00"),
            _product("Lipton Lemon Flavoured Sugar Free Ice Tea 1.5L", 1, "36.99", "36.99"),
            _product("Lipton Peach Flavoured Sugar Free Ice Tea 1.5L", 1, "36.99", "36.99"),
            _row("promo", "Buy 2 For R49", "24.98", promo_quantity=2, promo_price="49.00"),
            _product("Monster Aussie Style Lemonade Energy Drink 500ml", 4, "19.99", "79.96"),
            _product(
                "Trigz White Cheddar Flavoured Crunchy Popped Corn Snack 85g",
                1,
                "21.99",
                "21.99",
            ),
            _product("Just Popcorn Lightly Salted Flavoured Popcorn 100g", 1, "21.99", "21.99"),
            _product("Just Popcorn Butter Flavoured Popcorn 100g", 1, "21.99", "21.99"),
            _row("promo", "Buy 2 For R38", "5.98", promo_quantity=2, promo_price="38.00"),
            _product("OREO Original Biscuit 14 Pack", 4, "19.99", "79.96"),
            _row("promo", "Buy 2 For R30", "19.96", promo_quantity=2, promo_price="30.00"),
            _product("Cadbury Dairy Milk Whole Nut Chocolate Slab 150g", 2, "49.99", "99.98"),
            _product("Cadbury Bubbly Top Deck Chocolate Slab 150g", 1, "49.99", "49.99"),
            _row("promo", "Buy 3 & Save 25%", "37.50", promo_quantity=3, promo_percent="25"),
            _product(
                "Flanagan's Moreish Irish Paddy's Sea Salt Flavoured Kettle Fried Chips 120g",
                1,
                "31.99",
                "31.99",
            ),
            _product("Diddle Daddle Caramel Coated Popcorn 150g", 1, "32.99", "32.99"),
            _product("Bakers Snacktime Assorted Crackers 300g", 1, "64.99", "64.99"),
            _row("fee", "Delivery fee", "37.00"),
            _row("fee", "Xtra Savings Plus Delivery Discount", "-37.00"),
            _row("product", "Product sub-total", "680.38"),
        ],
        total="680.38",
    )

    settled = settle_receipt(read)
    items = settled.result.items

    assert [
        (item.description, item.quantity, item.line_discount, item.final_line_total)
        for item in items
    ] == [
        ("Rhodes Quality Extra Fruit Strawberry Blueberry Jam 340g", 1, "15.49", "49.50"),
        ("Rhodes Quality Ruby Grapefruit Marmalade 340g", 1, "15.49", "49.50"),
        ("Castello Brie 125g", 1, "0.00", "59.99"),
        ("Coca-Cola Zero Sugar Soft Drink 2L", 2, "9.98", "30.00"),
        ("Lipton Lemon Flavoured Sugar Free Ice Tea 1.5L", 1, "12.49", "24.50"),
        ("Lipton Peach Flavoured Sugar Free Ice Tea 1.5L", 1, "12.49", "24.50"),
        ("Monster Aussie Style Lemonade Energy Drink 500ml", 4, "0.00", "79.96"),
        ("Trigz White Cheddar Flavoured Crunchy Popped Corn Snack 85g", 1, "0.00", "21.99"),
        ("Just Popcorn Lightly Salted Flavoured Popcorn 100g", 1, "2.99", "19.00"),
        ("Just Popcorn Butter Flavoured Popcorn 100g", 1, "2.99", "19.00"),
        ("OREO Original Biscuit 14 Pack", 4, "19.96", "60.00"),
        ("Cadbury Dairy Milk Whole Nut Chocolate Slab 150g", 2, "25.00", "74.98"),
        ("Cadbury Bubbly Top Deck Chocolate Slab 150g", 1, "12.50", "37.49"),
        (
            "Flanagan's Moreish Irish Paddy's Sea Salt Flavoured Kettle Fried Chips 120g",
            1,
            "0.00",
            "31.99",
        ),
        ("Diddle Daddle Caramel Coated Popcorn 150g", 1, "0.00", "32.99"),
        ("Bakers Snacktime Assorted Crackers 300g", 1, "0.00", "64.99"),
    ]
    assert settled.items_total == Decimal("680.38")
    assert settled.sum_gap == Decimal("0.00")
    assert settled.unallocated == ()
    assert settled.needs_retry is False


def test_amount_off_promo_attaches_to_the_single_line_above() -> None:
    read = _read(
        [
            _product("T/BRUSH WHT MED", 2, "44.99", "89.98"),
            _row("promo", "XTRASAVE DENTAL", "27.00"),
        ],
        total="62.98",
    )

    item = settle_receipt(read).result.items[0]

    assert item.quantity == 2
    assert item.price_per_unit == "44.99"
    assert item.line_subtotal == "89.98"
    assert item.line_discount == "27.00"
    assert item.final_line_total == "62.98"


def test_unexplained_promo_keeps_printed_quantities_and_asks_for_another_read() -> None:
    read = _read(
        [
            _product("Castello Brie 125g", 1, "59.99", "59.99"),
            _row("promo", "Buy 2 For R10", "1.00", promo_quantity=2, promo_price="10.00"),
        ],
        total="59.99",
    )

    settled = settle_receipt(read)
    item = settled.result.items[0]

    assert item.quantity == 1
    assert item.line_discount == "0.00"
    assert item.final_line_total == "59.99"
    assert settled.needs_retry is True
    assert settled.unallocated == ("Buy 2 For R10 savings 1.00",)


def test_delivery_discount_written_without_a_minus_still_cancels_the_fee() -> None:
    read = _read(
        [
            _product("MILK", 1, "10.00", "10.00"),
            _row("fee", "Delivery fee", "37.00"),
            _row("fee", "Xtra Savings Plus Delivery Discount", "37.00"),
        ],
        total="10.00",
    )

    settled = settle_receipt(read)

    assert [item.description for item in settled.result.items] == ["MILK"]
    assert settled.needs_retry is False
    assert settled.items_total == Decimal("10.00")


def test_net_delivery_fee_becomes_one_line() -> None:
    read = _read(
        [
            _product("MILK", 1, "10.00", "10.00"),
            _row("fee", "Delivery fee", "37.00"),
        ],
        total="47.00",
    )

    settled = settle_receipt(read)

    assert [(item.description, item.final_line_total) for item in settled.result.items] == [
        ("MILK", "10.00"),
        ("Delivery", "37.00"),
    ]
    assert settled.needs_retry is False
