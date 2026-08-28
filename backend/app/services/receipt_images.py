"""Helpers to attach GCS signed URLs to receipt payloads."""

from __future__ import annotations

import uuid

from app.models.receipt import Receipt, effective_receipt_image_paths
from app.services.gcs import GCSService


def signed_urls_for_receipt(receipt: Receipt, gcs: GCSService) -> list[str]:
    return signed_urls_for_receipts([receipt], gcs).get(receipt.id, [])


def signed_urls_for_receipts(
    receipts: list[Receipt], gcs: GCSService
) -> dict[uuid.UUID, list[str]]:
    paths_per_receipt = [effective_receipt_image_paths(receipt) for receipt in receipts]
    flat_paths = [path for paths in paths_per_receipt for path in paths]
    signed = gcs.generate_signed_urls(flat_paths) if flat_paths else []
    cursor = 0
    result: dict[uuid.UUID, list[str]] = {}
    for receipt, paths in zip(receipts, paths_per_receipt, strict=True):
        urls: list[str] = []
        for _ in paths:
            url = signed[cursor]
            cursor += 1
            if url:
                urls.append(url)
        result[receipt.id] = urls
    return result
