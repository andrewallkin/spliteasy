"""OCR extraction contract — Pydantic models matching the notebook exactly."""

from __future__ import annotations

from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SYSTEM_PROMPT = """
You read South African retail receipts into rows.
Do not apply promotions. A later step attaches each promo
to the product lines above it, using the printed savings.

Emit one row per product, promo, or fee, top to bottom.
Every numeric field is a string or an integer. No nulls.

kind = "product":
- description is the item name.
- quantity is the printed count ("Qty N" or "N @").
  Use 1 when no count is printed.
- price_per_unit is the printed unit price.
- amount is the shelf line total BEFORE any promo
  (unit price times quantity). Use the total column
  next to the product, not a price after a deal.
- promo_quantity is 0. promo_price and promo_percent
  are "0.00".

kind = "promo":
- A promo is its own row. Never fold it into the product
  above or below. Never change a quantity to make a deal fit.
- description is the promo text, such as "Buy 2 For R99",
  "Buy 3 & Save 25%", or "XTRASAVE DENTAL".
- amount is the printed savings as a positive number.
  A printed "-R30.98" has amount "30.98".
- "Buy N for RXX": promo_quantity is N, promo_price is
  "XX.00", promo_percent is "0.00".
- "Buy N and save P%": promo_quantity is N, promo_percent
  is "25" for 25%, promo_price is "0.00".
- A savings line with no deal price and no percent
  (club card, XTRASAVE, a negative amount under one item):
  promo_quantity is 0, promo_price and promo_percent are "0.00".
- quantity is 1 and price_per_unit is "0.00".

kind = "fee":
- Delivery, bag, or tip charges, and discounts that offset them.
- amount is signed: a charge is "37.00", a discount is "-37.00".
- promo_quantity is 0. promo_price and promo_percent are "0.00".

Skip these:
- Do not emit subtotals, invoice summaries, tax lines, or the
  grand total as rows. Put the printed gross only in total_amount.
- Omit free, complimentary, or gift lines priced at 0.00.
  For buy-one-get-one-free, keep the paid product only.
- The same line may show in more than one photo. Emit it once.

Example: a grouped deal stays a promo row. Brie is unchanged.

Rhodes Jam 340g            R64.99
Rhodes Marmalade 340g      R64.99
** Buy 2 For R99 **       -R30.98
Castello Brie 125g         R59.99

{"kind":"product","description":"Rhodes Jam 340g","quantity":1,
 "price_per_unit":"64.99","amount":"64.99","promo_quantity":0,
 "promo_price":"0.00","promo_percent":"0.00"}
{"kind":"product","description":"Rhodes Marmalade 340g","quantity":1,
 "price_per_unit":"64.99","amount":"64.99","promo_quantity":0,
 "promo_price":"0.00","promo_percent":"0.00"}
{"kind":"promo","description":"Buy 2 For R99","quantity":1,
 "price_per_unit":"0.00","amount":"30.98","promo_quantity":2,
 "promo_price":"99.00","promo_percent":"0.00"}
{"kind":"product","description":"Castello Brie 125g","quantity":1,
 "price_per_unit":"59.99","amount":"59.99","promo_quantity":0,
 "promo_price":"0.00","promo_percent":"0.00"}

Example: quantity already printed, then a percent deal.

OREO Original Biscuit 14 Pack  R79.96
Qty 4
** Buy 2 For R30 **           -R19.96
Cadbury Whole Nut 150g        R99.98
Qty 2
Cadbury Bubbly 150g           R49.99
** Buy 3 & Save 25% **        -R37.50

{"kind":"product","description":"OREO Original Biscuit 14 Pack",
 "quantity":4,"price_per_unit":"19.99","amount":"79.96",
 "promo_quantity":0,"promo_price":"0.00","promo_percent":"0.00"}
{"kind":"promo","description":"Buy 2 For R30","quantity":1,
 "price_per_unit":"0.00","amount":"19.96","promo_quantity":2,
 "promo_price":"30.00","promo_percent":"0.00"}
{"kind":"product","description":"Cadbury Whole Nut 150g",
 "quantity":2,"price_per_unit":"49.99","amount":"99.98",
 "promo_quantity":0,"promo_price":"0.00","promo_percent":"0.00"}
{"kind":"product","description":"Cadbury Bubbly 150g","quantity":1,
 "price_per_unit":"49.99","amount":"49.99","promo_quantity":0,
 "promo_price":"0.00","promo_percent":"0.00"}
{"kind":"promo","description":"Buy 3 & Save 25%","quantity":1,
 "price_per_unit":"0.00","amount":"37.50","promo_quantity":3,
 "promo_price":"0.00","promo_percent":"25"}

Example: a club-card saving, and delivery that is fully discounted.

T/BRUSH WHT MED     R89.98
         2 @        R44.99
XTRASAVE DENTAL    -R27.00
Delivery fee        R37.00
Delivery Discount  -R37.00

{"kind":"product","description":"T/BRUSH WHT MED","quantity":2,
 "price_per_unit":"44.99","amount":"89.98","promo_quantity":0,
 "promo_price":"0.00","promo_percent":"0.00"}
{"kind":"promo","description":"XTRASAVE DENTAL","quantity":1,
 "price_per_unit":"0.00","amount":"27.00","promo_quantity":0,
 "promo_price":"0.00","promo_percent":"0.00"}
{"kind":"fee","description":"Delivery fee","quantity":1,
 "price_per_unit":"0.00","amount":"37.00","promo_quantity":0,
 "promo_price":"0.00","promo_percent":"0.00"}
{"kind":"fee","description":"Delivery Discount","quantity":1,
 "price_per_unit":"0.00","amount":"-37.00","promo_quantity":0,
 "promo_price":"0.00","promo_percent":"0.00"}
"""

USER_PROMPT = """
Extract every product, promo, and fee row, and the printed gross total.
- Rows stay in reading order. A promo is a separate row.
  Do not apply it to any product.
- Product amount is the shelf total before the promo.
  Product quantity is the printed quantity.
- Promo amount is the printed savings as a positive number.
- Fee discounts are negative amounts.
- Do not return nulls. Use 0 and "0.00" for promo fields
  that do not apply.
- merchant_name is the store name when it is printed,
  for example "Checkers" or "Clicks".
  Use "Unknown" when the photos do not show it.
"""

USER_PROMPT_MULTI_PAGE = """
Multiple images are attached. Treat them as sequential parts of ONE
receipt (pages, or separate photos of the same slip). Combine rows in
reading order. Use the grand total from the page with the payment summary.
"""


class OCRReadRow(BaseModel):
    """One printed product, promo, or fee, before promotions are applied."""

    model_config = ConfigDict(extra="forbid")

    kind: Literal["product", "promo", "fee"] = Field(
        ...,
        description="product, promo, or fee.",
    )
    description: str = Field(..., description="Text printed for this row.")
    quantity: int = Field(..., description="Printed quantity for a product. 1 for a promo or fee.")
    price_per_unit: str = Field(
        ...,
        description="Unit price for a product. 0.00 for a promo or fee.",
    )
    amount: str = Field(
        ...,
        description="Product shelf total, positive promo savings, or signed fee amount.",
    )
    promo_quantity: int = Field(..., description="N in Buy N. 0 when this is not a multi-buy.")
    promo_price: str = Field(
        ...,
        description="Deal price in Buy N for RXX. 0.00 when there is no deal price.",
    )
    promo_percent: str = Field(
        ...,
        description="Percent in Buy N and save P%. 0.00 when there is no percent.",
    )


class ReceiptOCRRead(BaseModel):
    """What the model reads. Promotions are not applied yet."""

    model_config = ConfigDict(extra="forbid")

    merchant_name: str = Field(..., description="Store name, or Unknown when it is not printed.")
    currency: str = Field(..., description="Currency code, usually ZAR.")
    total_amount: str = Field(..., description="Printed gross total.")
    rows: list[OCRReadRow]


class OCRLineItemExtracted(BaseModel):
    """Single line item with forced non-null values for consistency."""

    model_config = ConfigDict(extra="forbid")

    description: str = Field(..., description="Item label as printed on the receipt.")

    # Force quantity to int and default to 1
    quantity: int = Field(
        default=1,
        description="The count or weight. Default to 1 if not specified.",
    )

    # Ensure all money fields are strings and always populated
    price_per_unit: str = Field(
        ...,
        description="The price of a single unit. If not listed, use line_subtotal.",
    )
    line_subtotal: str = Field(
        ...,
        description="The amount printed next to the item name (before discounts).",
    )
    line_discount: str = Field(
        default="0.00",
        description="The discount amount. Default to '0.00' if no discount exists.",
    )
    final_line_total: str = Field(
        ...,
        description="The final cost for this line: (price_per_unit * quantity) - line_discount.",
    )

    confidence: float = Field(0.0, description="Confidence score in the range [0, 1]")


class ReceiptOCRResult(BaseModel):
    """Structured receipt parse with non-null totals."""

    model_config = ConfigDict(extra="forbid")

    merchant_name: str = Field("Unknown", description="Store name. Default to 'Unknown'.")
    currency: str = Field("ZAR", description="Currency code. Default to 'ZAR'.")
    total_amount: str = Field(..., description="Grand total (Gross amount).")
    items: list[OCRLineItemExtracted] = Field(default_factory=list)

    @model_validator(mode="after")
    def synthetic_total_line(self) -> ReceiptOCRResult:
        if self.items or self.total_amount is None:
            return self
        amt = str(Decimal(str(self.total_amount)).quantize(Decimal("0.01")))
        return self.model_copy(
            update={
                "items": [
                    OCRLineItemExtracted(
                        description=self.merchant_name,
                        price_per_unit=amt,
                        line_subtotal=amt,
                        final_line_total=amt,
                        quantity=1,
                        line_discount="0.00",
                        confidence=1.0,
                    )
                ]
            }
        )
