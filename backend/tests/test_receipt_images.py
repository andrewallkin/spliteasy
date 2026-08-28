import uuid

from app.models.receipt import Receipt
from app.services.receipt_images import signed_urls_for_receipt, signed_urls_for_receipts


class _FakeGcs:
    def generate_signed_url(self, object_path: str) -> str | None:
        if object_path.endswith("missing.jpg"):
            return None
        return f"https://signed.example/{object_path}"

    def generate_signed_urls(self, object_paths: list[str]) -> list[str | None]:
        return [self.generate_signed_url(path) for path in object_paths]


def test_signed_urls_for_receipt_skips_failed_paths() -> None:
    receipt = Receipt(
        id=uuid.uuid4(),
        group_id=uuid.uuid4(),
        uploaded_by=uuid.uuid4(),
        status="assigned",
        image_gcs_path="receipts/a.jpg",
        image_gcs_paths=["receipts/a.jpg", "receipts/missing.jpg"],
    )
    assert signed_urls_for_receipt(receipt, _FakeGcs()) == ["https://signed.example/receipts/a.jpg"]


def test_signed_urls_for_receipts_maps_by_id() -> None:
    first = Receipt(
        id=uuid.uuid4(),
        group_id=uuid.uuid4(),
        uploaded_by=uuid.uuid4(),
        status="assigned",
        image_gcs_path="receipts/one.jpg",
    )
    second = Receipt(
        id=uuid.uuid4(),
        group_id=uuid.uuid4(),
        uploaded_by=uuid.uuid4(),
        status="assigned",
        image_gcs_paths=["receipts/two.jpg", "receipts/three.jpg"],
    )
    urls = signed_urls_for_receipts([first, second], _FakeGcs())
    assert urls[first.id] == ["https://signed.example/receipts/one.jpg"]
    assert urls[second.id] == [
        "https://signed.example/receipts/two.jpg",
        "https://signed.example/receipts/three.jpg",
    ]
