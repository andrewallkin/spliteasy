"""OCR extraction contract — Pydantic models matching the notebook exactly."""

from __future__ import annotations

from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SYSTEM_PROMPT = """You are a specialized vision-to-structured-data assistant for South African retail receipts.
Your goal is to provide a clean JSON where EVERY numeric field is populated (no nulls).

### Extraction Logic:
1. QUANTITY & PRICE: If an item does not have an '@' multiplier line, set 'quantity' to 1 and 'price_per_unit' to match the 'line_subtotal'.
2. DISCOUNTS: Lines like 'XTRASAVE' or negative values are discounts. Attach them to the preceding item. If no discount exists, set 'line_discount' to "0.00".
3. LINE TOTALS: 'final_line_total' MUST equal ('line_subtotal' minus 'line_discount').
4. MATH CONSISTENCY: Ensure 'line_subtotal' equals ('price_per_unit' * 'quantity').
5. MULTIPLE IMAGES: The same physical receipt line may appear in more than one image (e.g. overlap between photos, folds, or stitching). **Do not duplicate** items: merge or choose a single canonical entry per line; each purchased line must appear at most once in `items`.
6. FREE / COMPLIMENTARY LINES: OMIT any line that is explicitly free, complimentary, promotional, a gift, or otherwise printed with a R0.00 / 0.00 price. Do not include them in `items`. Examples: "FREE COMBO 8", "COMPLIMENTARY WATER", "GIFT - CHOCOLATE", or any line whose printed amount is zero. Buy-one-get-one-free promotions: keep only the paid line(s); drop the free line entirely.

### Example Transformation:
Input:
T/BRUSH WHT MED       R89.98
            2 @       R44.99
XTRASAVE DENTAL      -R27.00

Output Item:
{
  "description": "T/BRUSH WHT MED",
  "quantity": 2,
  "price_per_unit": "44.99",
  "line_subtotal": "89.98",
  "line_discount": "27.00",
  "final_line_total": "62.98"
}

Input:
FEATHERLITE CON 12 V  R240.00

Output Item:
{
  "description": "FEATHERLITE CON 12 V",
  "quantity": 1,
  "price_per_unit": "240.00",
  "line_subtotal": "240.00",
  "line_discount": "0.00",
  "final_line_total": "240.00"
}
"""

USER_PROMPT = """
Extract all line items and the grand total (GROSS) from this receipt.
- Ensure 'quantity' is an integer.
- Ensure 'line_discount' is "0.00" if no discount is present.
- Do not return null for any numeric fields; infer the unit price if it is not explicitly stated.
- Skip any free / complimentary / promotional line (price 0.00). Do not emit it as an item.
- Ensure the 'merchant_name' is extracted (e.g., 'Checkers Rondebosch' or 'Clicks').
"""

USER_PROMPT_MULTI_PAGE = """
Multiple images are attached: treat them as sequential parts of ONE receipt (e.g. multiple pages or separate photos of the same slip). Combine all line items in reading order; use the correct grand total (usually on the page that shows the payment/total summary).
"""


class OCRLineItemExtracted(BaseModel):
    """Single line item with forced non-null values for consistency."""

    model_config = ConfigDict(extra="forbid")

    description: str = Field(..., description="Item label as printed on the receipt.")

    # Force quantity to int and default to 1
    quantity: int = Field(default=1, description="The count or weight. Default to 1 if not specified.")

    # Ensure all money fields are strings and always populated
    price_per_unit: str = Field(..., description="The price of a single unit. If not listed, use line_subtotal.")
    line_subtotal: str = Field(..., description="The amount printed next to the item name (before discounts).")
    line_discount: str = Field(default="0.00", description="The discount amount. Default to '0.00' if no discount exists.")
    final_line_total: str = Field(..., description="The final cost for this line: (price_per_unit * quantity) - line_discount.")

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
