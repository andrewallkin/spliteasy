from __future__ import annotations

import base64
from io import BytesIO

from pydantic import ValidationError

from app.config import get_settings
from app.schemas.ocr import (
    SYSTEM_PROMPT,
    USER_PROMPT,
    USER_PROMPT_MULTI_PAGE,
    OCRLineItemExtracted,
    ReceiptOCRResult,
)
from app.services.receipt_math import (
    ReceiptExtraction,
    build_retry_user_content,
    prefer_attempt,
    reconcile_receipt,
)

OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

SCHEMA_REPAIR = (
    "Your previous response was not valid against the required schema. "
    "Validation errors:\n{errors}\n"
    "Return ONLY corrected JSON matching the schema exactly. No prose."
)


def image_bytes_to_jpeg_bytes(body: bytes, content_type: str = "") -> bytes:
    """Convert image bytes to canonical JPEG bytes.

    Handles JPEG (pass-through), HEIC/HEIF (via pillow-heif), and other
    formats (via Pillow). Mirrors the notebook's image_file_to_jpeg_base64 logic.
    """
    ct = (content_type or "").lower()
    if "jpeg" in ct or "jpg" in ct:
        return body

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
        return buf.getvalue()
    except Exception as exc:
        raise RuntimeError(f"Could not convert image to JPEG: {exc}") from exc


def image_bytes_to_jpeg_base64(body: bytes, content_type: str = "") -> str:
    """Convert image bytes to JPEG base64 string."""
    return base64.b64encode(image_bytes_to_jpeg_bytes(body, content_type)).decode()


def _image_content(prompt: str, images_base64: list[str]) -> list[dict]:
    content: list[dict] = [{"type": "text", "text": prompt}]
    for encoded in images_base64:
        content.append(
            {
                "type": "image_url",
                "image_url": {"url": f"data:image/jpeg;base64,{encoded}"},
            }
        )
    return content


def _dummy_extraction() -> ReceiptExtraction:
    report = reconcile_receipt(
        ReceiptOCRResult(
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
    )
    return ReceiptExtraction(result=report.result, retried=False, sum_gap=report.sum_gap)


async def _parse_receipt(client: object, model: str, user_content: list[dict]) -> ReceiptOCRResult:
    messages: list[dict] = [
        {"role": "system", "content": SYSTEM_PROMPT.strip()},
        {"role": "user", "content": user_content},
    ]
    response_format = {
        "type": "json_schema",
        "json_schema": {
            "name": ReceiptOCRResult.__name__,
            "strict": True,
            "schema": ReceiptOCRResult.model_json_schema(),
        },
    }
    extra_body = {"provider": {"require_parameters": True}}
    for attempt in range(2):
        response = await client.chat.completions.create(  # type: ignore[attr-defined]
            model=model,
            messages=messages,
            temperature=0,
            response_format=response_format,
            extra_body=extra_body,
        )
        content = response.choices[0].message.content or ""
        try:
            return ReceiptOCRResult.model_validate_json(content)
        except ValidationError as exc:
            if attempt == 1:
                raise
            errors = "\n".join(str(err) for err in exc.errors()[:10])
            messages = [
                *messages,
                {"role": "assistant", "content": content},
                {"role": "user", "content": SCHEMA_REPAIR.format(errors=errors)},
            ]
    raise RuntimeError("No parsed ReceiptOCRResult in response")


async def extract_receipt_items(images_base64: list[str]) -> ReceiptExtraction:
    """Extract structured receipt data from one or more JPEG base64 images.

    Uses OpenRouter chat completions with strict JSON schema output.
    Falls back to a dummy result when no API key is configured.
    """
    settings = get_settings()
    if not settings.openrouter_api_key:
        return _dummy_extraction()

    if not images_base64:
        raise ValueError("At least one JPEG base64 image is required.")

    prompt = USER_PROMPT.strip()
    if len(images_base64) > 1:
        prompt = prompt + "\n\n" + USER_PROMPT_MULTI_PAGE.strip()

    from openai import AsyncOpenAI

    client = AsyncOpenAI(
        base_url=OPENROUTER_BASE_URL,
        api_key=settings.openrouter_api_key,
        timeout=120.0,
    )
    first_raw = await _parse_receipt(
        client,
        settings.openrouter_model,
        _image_content(prompt, images_base64),
    )
    first = reconcile_receipt(first_raw)
    chosen = first
    retried = False
    if first.needs_retry:
        retried = True
        try:
            second_raw = await _parse_receipt(
                client,
                settings.openrouter_model,
                build_retry_user_content(images_base64, first.result, first),
            )
            chosen = prefer_attempt(first, reconcile_receipt(second_raw))
        except Exception:
            chosen = first
    return ReceiptExtraction(result=chosen.result, retried=retried, sum_gap=chosen.sum_gap)
