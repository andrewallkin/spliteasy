"""Google Cloud Storage service for image uploads and downloads."""

import base64
import json
import logging
from datetime import timedelta
from io import BytesIO
from typing import Optional

from google.cloud import storage
from google.oauth2 import service_account

from app.config import get_settings

logger = logging.getLogger(__name__)

_gcs_service: Optional["GCSService"] = None


class GCSService:
    """Service class for Google Cloud Storage image operations."""

    def __init__(self) -> None:
        self.client: Optional[storage.Client] = None
        self.bucket_name: Optional[str] = None
        self._initialize_service()

    def _initialize_service(self) -> None:
        """Initialize the GCS client using base64-encoded service account credentials."""
        settings = get_settings()
        if not settings.gcp_service_account_credentials:
            logger.warning("GCP_SERVICE_ACCOUNT_CREDENTIALS environment variable not set")
            return
        try:
            credentials_json = base64.b64decode(
                settings.gcp_service_account_credentials
            ).decode("utf-8")
            credentials_dict = json.loads(credentials_json)
            credentials = service_account.Credentials.from_service_account_info(
                credentials_dict
            )
            self.client = storage.Client(credentials=credentials)
            self.bucket_name = settings.gcs_images_bucket_name or None
            logger.info("GCS service initialized", extra={"bucket": self.bucket_name})
        except Exception as e:
            logger.exception("GCS initialization failed: %s: %s", type(e).__name__, e)
            self.client = None
            self.bucket_name = None

    def is_available(self) -> bool:
        """Check if the GCS service is available."""
        return self.client is not None and bool(self.bucket_name)

    def upload_image(
        self, folder: str, object_name: str, data: bytes, content_type: str
    ) -> Optional[str]:
        """Upload image bytes to GCS. Returns the object path on success, None on failure."""
        if not self.is_available():
            logger.error("GCS service not available")
            return None
        object_path = f"{folder}/{object_name}"
        logger.info("GCS upload started", extra={"object_path": object_path})
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(object_path)
            blob.upload_from_file(BytesIO(data), content_type=content_type)
            logger.info("GCS upload complete", extra={"object_path": object_path})
            return object_path
        except Exception as e:
            logger.exception(
                "GCS upload failed: %s: %s", type(e).__name__, e, extra={"object_path": object_path}
            )
            return None

    def download_image(self, object_path: str) -> Optional[bytes]:
        """Download image bytes from GCS. Returns bytes on success, None on failure."""
        if not self.is_available():
            logger.error("GCS service not available")
            return None
        logger.info("GCS download started", extra={"object_path": object_path})
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(object_path)
            data = blob.download_as_bytes()
            logger.info("GCS download complete", extra={"object_path": object_path})
            return data
        except Exception as e:
            logger.exception(
                "GCS download failed: %s: %s",
                type(e).__name__,
                e,
                extra={"object_path": object_path},
            )
            return None

    def delete_image(self, object_path: str) -> bool:
        """Delete an image from GCS. Returns True on success, False on failure."""
        if not self.is_available():
            logger.error("GCS service not available")
            return False
        if not object_path:
            logger.warning("No object path provided for GCS deletion")
            return False
        logger.info("GCS delete started", extra={"object_path": object_path})
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(object_path)
            blob.delete()
            logger.info("GCS delete complete", extra={"object_path": object_path})
            return True
        except Exception as e:
            logger.exception(
                "GCS delete failed: %s: %s", type(e).__name__, e, extra={"object_path": object_path}
            )
            return False

    def generate_signed_url(self, object_path: str, expiration_days: int = 7) -> Optional[str]:
        """Generate a signed URL for an object. Returns URL string on success, None on failure."""
        if not self.is_available():
            logger.error("GCS service not available")
            return None
        try:
            bucket = self.client.bucket(self.bucket_name)
            blob = bucket.blob(object_path)
            url = blob.generate_signed_url(
                expiration=timedelta(days=expiration_days),
                method="GET",
                version="v4",
            )
            return url
        except Exception as e:
            logger.exception(
                "GCS signed URL generation failed: %s: %s",
                type(e).__name__,
                e,
                extra={"object_path": object_path},
            )
            return None

    def generate_signed_urls(self, object_paths: list[str]) -> list[Optional[str]]:
        """Generate signed URLs for many objects, preserving input order."""
        return [self.generate_signed_url(path) if path else None for path in object_paths]


def get_gcs_service() -> GCSService:
    """Return the module-level GCSService singleton. Use as a FastAPI dependency."""
    global _gcs_service
    if _gcs_service is None:
        _gcs_service = GCSService()
    return _gcs_service
