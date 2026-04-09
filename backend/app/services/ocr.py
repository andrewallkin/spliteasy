from __future__ import annotations

import base64
from io import BytesIO

from app.core.settings import get_settings
from app.schemas.ocr import (
    OCRLineItemExtracted,
    SYSTEM_PROMPT,
    USER_PROMPT,
    USER_PROMPT_MULTI_PAGE,
    ReceiptOCRResult,
)

settings = get_settings()


def image_bytes_to_jpeg_base64(body: bytes, content_type: str = "") -> str:
    """Convert image bytes to JPEG base64 string.

    Handles JPEG (pass-through), HEIC/HEIF (via pillow-heif), and other
    formats (via Pillow). Mirrors the notebook's image_file_to_jpeg_base64 logic.
    """
    ct = (content_type or "").lower()
    if "jpeg" in ct or "jpg" in ct:
        return base64.b64encode(body).decode()

    if "heic" in ct or "heif" in ct:
        try:
            from pillow_heif import register_heif_opener

            register_heif_opener()
        except ImportError:
            pass  # fall through to Pillow below

    try:
        from PIL import Image

        img = Image.open(BytesIO(body)).convert("RGB")
        buf = BytesIO()
        img.save(buf, format="JPEG", quality=90)
        return base64.b64encode(buf.getvalue()).decode()
    except Exception as exc:
        raise RuntimeError(f"Could not convert image to JPEG: {exc}") from exc


def _parsed_receipt_from_response(rsp: object) -> ReceiptOCRResult:
    """Walk Responses API output to find the parsed ReceiptOCRResult."""
    for output in rsp.output:  # type: ignore[attr-defined]
        if output.type != "message":
            continue
        for item in output.content:
            if item.type != "output_text":
                continue
            if item.parsed is not None:
                return item.parsed  # type: ignore[return-value]
    raise RuntimeError(f"No parsed ReceiptOCRResult in response: {rsp.output!r}")


async def extract_receipt_items(images_base64: list[str]) -> ReceiptOCRResult:
    """Extract structured receipt data from one or more JPEG base64 images.

    Uses OpenAI Responses API with structured output (ReceiptOCRResult).
    Falls back to a dummy result when no API key is configured.
    """
    if not settings.openai_api_key:
        # Developer fallback so local app still works without paid API credentials.
        return ReceiptOCRResult(
            merchant_name="Unknown",
            currency="ZAR",
            total_amount="0.00",
            items=[
                OCRLineItemExtracted(
                    description="Receipt total",
                    price_per_unit="0.00",
                    line_subtotal="0.00",
                    line_discount="0.00",
                    final_line_total="0.00",
                    quantity=1,
                    confidence=0.0,
                ),
            ],
        )

    if not images_base64:
        raise ValueError("At least one JPEG base64 image is required.")

    prompt = USER_PROMPT.strip()
    if len(images_base64) > 1:
        prompt = prompt + "\n\n" + USER_PROMPT_MULTI_PAGE.strip()

    content: list[dict] = [{"type": "input_text", "text": prompt}]
    for b64 in images_base64:
        content.append(
            {
                "type": "input_image",
                "image_url": f"data:image/jpeg;base64,{b64}",
                "detail": "high",
            }
        )

    from openai import AsyncOpenAI

    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=120.0)
    rsp = await client.responses.parse(
        model=settings.openai_model,
        instructions=SYSTEM_PROMPT,
        input=[{"role": "user", "content": content}],
        text_format=ReceiptOCRResult,
        temperature=0,
    )
    return _parsed_receipt_from_response(rsp)
