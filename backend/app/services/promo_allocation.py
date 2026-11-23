"""Attach printed promotions to the product lines above them.

The model reads rows. This module checks that a promo's printed savings is
explained by those lines, then splits the savings across them. A promo that
cannot be explained is left unallocated so the receipt can be read again.
"""

from __future__ import annotations

import re
from dataclasses import dataclass, replace
from decimal import Decimal, InvalidOperation

from app.schemas.ocr import OCRLineItemExtracted, OCRReadRow, ReceiptOCRRead, ReceiptOCRResult
from app.services.receipt_math import CENT, ReconciledReceipt, money, reconcile_receipt

TOLERANCE = CENT * 2
_SUMMARY_ROW = re.compile(
    r"(sub[\s-]?total|invoice summary|grand total|product total|minimum spend|(^|\b)total\b)",
    re.IGNORECASE,
)
_FEE_DISCOUNT = re.compile(r"discount|saving", re.IGNORECASE)


@dataclass
class _Product:
    description: str
    quantity: int
    unit: Decimal
    shelf: Decimal
    claimed: int = 0
    discount: Decimal = Decimal("0.00")

    def unit_price(self) -> Decimal:
        if self.quantity <= 0:
            return self.shelf
        extended = money(self.unit * self.quantity)
        if abs(extended - self.shelf) <= CENT:
            return self.unit
        return money(self.shelf / Decimal(self.quantity))


def _parse_amount(value: object) -> Decimal:
    text = str(value).strip().replace("R", "").replace("r", "").replace(",", "").replace(" ", "")
    text = text.replace("%", "")
    if text in {"", "-", ".", "-."}:
        return Decimal("0.00")
    try:
        return money(text)
    except InvalidOperation:
        return Decimal("0.00")


def _parse_percent(value: object) -> Decimal:
    text = str(value).strip().replace("%", "").replace(" ", "")
    if not text:
        return Decimal("0")
    try:
        return Decimal(text)
    except InvalidOperation:
        return Decimal("0")


def _percent_rate(percent: Decimal) -> Decimal:
    if percent > 1:
        return percent / Decimal(100)
    return percent


def _unclaimed_units(products: list[_Product], before: int) -> list[tuple[int, Decimal]]:
    units: list[tuple[int, Decimal]] = []
    for index in range(before - 1, -1, -1):
        line = products[index]
        free = line.quantity - line.claimed
        price = line.unit_price()
        units.extend((index, price) for _ in range(free))
    return units


def _nearest_line_units(products: list[_Product], before: int) -> list[tuple[int, Decimal]]:
    if before <= 0:
        return []
    index = before - 1
    line = products[index]
    free = line.quantity - line.claimed
    price = line.unit_price()
    return [(index, price) for _ in range(free)]


def _match_deal(
    units: list[tuple[int, Decimal]],
    deal_quantity: int,
    deal_price: Decimal,
    savings: Decimal,
) -> list[tuple[int, Decimal]] | None:
    if deal_quantity <= 0 or deal_price <= 0:
        return None
    max_deals = len(units) // deal_quantity
    for count in range(1, max_deals + 1):
        chosen = units[: count * deal_quantity]
        shelf = money(sum((price for _, price in chosen), Decimal("0")))
        expected = money(shelf - money(deal_price * count))
        if abs(expected - savings) <= TOLERANCE:
            return chosen
    return None


def _match_percent(
    units: list[tuple[int, Decimal]],
    deal_quantity: int,
    percent: Decimal,
    savings: Decimal,
) -> list[tuple[int, Decimal]] | None:
    if deal_quantity <= 0 or percent <= 0:
        return None
    rate = _percent_rate(percent)
    max_deals = len(units) // deal_quantity
    for count in range(1, max_deals + 1):
        chosen = units[: count * deal_quantity]
        shelf = money(sum((price for _, price in chosen), Decimal("0")))
        expected = money(shelf * rate)
        if abs(expected - savings) <= TOLERANCE:
            return chosen
    return None


def _match_amount_off(
    units: list[tuple[int, Decimal]],
    savings: Decimal,
) -> list[tuple[int, Decimal]] | None:
    if not units:
        return None
    chosen: list[tuple[int, Decimal]] = []
    running = Decimal("0.00")
    current_line: int | None = None
    for index, price in units:
        if current_line is None:
            current_line = index
        elif index != current_line and running + TOLERANCE >= savings:
            break
        chosen.append((index, price))
        running = money(running + price)
        current_line = index
        if index != units[0][0] and running + TOLERANCE >= savings:
            break
    if money(sum((price for _, price in chosen), Decimal("0"))) + TOLERANCE < savings:
        return None
    return chosen


def _choose_units(
    products: list[_Product],
    before: int,
    row: OCRReadRow,
    savings: Decimal,
) -> list[tuple[int, Decimal]] | None:
    deal_quantity = row.promo_quantity
    deal_price = _parse_amount(row.promo_price)
    percent = _parse_percent(row.promo_percent)
    nearest = _nearest_line_units(products, before)
    window = _unclaimed_units(products, before)
    if percent > 0 and deal_quantity > 0:
        return _match_percent(nearest, deal_quantity, percent, savings) or _match_percent(
            window, deal_quantity, percent, savings
        )
    if deal_price > 0 and deal_quantity > 0:
        return _match_deal(nearest, deal_quantity, deal_price, savings) or _match_deal(
            window, deal_quantity, deal_price, savings
        )
    return _match_amount_off(window, savings)


def _split_savings(
    chosen: list[tuple[int, Decimal]],
    savings: Decimal,
) -> dict[int, Decimal]:
    shelves: dict[int, Decimal] = {}
    order: list[int] = []
    for index, price in chosen:
        if index not in shelves:
            order.append(index)
            shelves[index] = Decimal("0.00")
        shelves[index] = money(shelves[index] + price)
    reading = list(reversed(order))
    total = money(sum((shelves[index] for index in reading), Decimal("0")))
    assigned = Decimal("0.00")
    shares: dict[int, Decimal] = {}
    for position, index in enumerate(reading):
        if position == len(reading) - 1:
            share = money(savings - assigned)
        else:
            share = money(savings * shelves[index] / total)
            assigned = money(assigned + share)
        shares[index] = share
    return shares


def _apply(products: list[_Product], chosen: list[tuple[int, Decimal]], savings: Decimal) -> None:
    counts: dict[int, int] = {}
    for index, _price in chosen:
        counts[index] = counts.get(index, 0) + 1
    for index, share in _split_savings(chosen, savings).items():
        products[index].discount = money(products[index].discount + share)
        products[index].claimed += counts[index]


def _promo_label(row: OCRReadRow, savings: Decimal) -> str:
    return f"{row.description} savings {savings:.2f}"


def _signed_fee(row: OCRReadRow) -> Decimal:
    amount = _parse_amount(row.amount)
    if amount > 0 and _FEE_DISCOUNT.search(row.description):
        return -amount
    return amount


def _is_summary(row: OCRReadRow) -> bool:
    return _SUMMARY_ROW.search(row.description) is not None


def allocate_rows(read: ReceiptOCRRead) -> tuple[ReceiptOCRResult, tuple[str, ...]]:
    products: list[_Product] = []
    promos: list[tuple[int, OCRReadRow]] = []
    fees: list[OCRReadRow] = []
    for row in read.rows:
        if _is_summary(row):
            continue
        if row.kind == "product":
            quantity = row.quantity if row.quantity > 0 else 1
            unit = _parse_amount(row.price_per_unit)
            shelf = _parse_amount(row.amount)
            if shelf <= 0:
                shelf = money(unit * quantity)
            products.append(
                _Product(description=row.description, quantity=quantity, unit=unit, shelf=shelf)
            )
        elif row.kind == "promo":
            promos.append((len(products), row))
        elif row.kind == "fee":
            fees.append(row)

    unallocated: list[str] = []
    for before, row in promos:
        savings = abs(_parse_amount(row.amount))
        if savings <= 0:
            continue
        chosen = _choose_units(products, before, row, savings)
        if chosen is None:
            unallocated.append(_promo_label(row, savings))
            continue
        _apply(products, chosen, savings)

    items: list[OCRLineItemExtracted] = []
    for line in products:
        quantity = line.quantity
        subtotal = line.shelf
        unit = line.unit
        if quantity > 0 and abs(money(unit * quantity) - subtotal) > CENT:
            unit = money(subtotal / Decimal(quantity))
        discount = money(min(line.discount, subtotal))
        items.append(
            OCRLineItemExtracted(
                description=line.description,
                quantity=quantity,
                price_per_unit=f"{unit:.2f}",
                line_subtotal=f"{subtotal:.2f}",
                line_discount=f"{discount:.2f}",
                final_line_total=f"{money(subtotal - discount):.2f}",
                confidence=0.9,
            )
        )

    fee_net = money(sum((_signed_fee(row) for row in fees), Decimal("0")))
    if fee_net != 0:
        text = f"{fee_net:.2f}"
        items.append(
            OCRLineItemExtracted(
                description="Delivery",
                quantity=1,
                price_per_unit=text,
                line_subtotal=text,
                line_discount="0.00",
                final_line_total=text,
                confidence=0.9,
            )
        )

    result = ReceiptOCRResult(
        merchant_name=read.merchant_name,
        currency=read.currency,
        total_amount=f"{_parse_amount(read.total_amount):.2f}",
        items=items,
    )
    return result, tuple(unallocated)


def settle_receipt(read: ReceiptOCRRead) -> ReconciledReceipt:
    result, unallocated = allocate_rows(read)
    report = reconcile_receipt(result)
    return replace(
        report,
        needs_retry=report.needs_retry or bool(unallocated),
        unallocated=unallocated,
    )
