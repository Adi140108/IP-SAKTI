import os
import io
import re
import logging
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger("IP-SAKTI.BackblazeB2")


class BackblazeB2Service:
    """
    Backblaze B2 Document Storage Service.
    Supports STORAGE_MODE = "backblaze" (production) vs "mock" (development).
    In production mode, storage failures raise explicit un-swallowed exceptions and NEVER fall back to local disk.
    """

    def __init__(self):
        self.b2_api = None
        self.bucket = None
        self.local_storage_dir = os.path.abspath("./data/local_storage")
        if not self.is_production_mode():
            os.makedirs(self.local_storage_dir, exist_ok=True)
        self.initialize_b2()

    @staticmethod
    def is_production_mode() -> bool:
        return settings.APP_ENV == "production" or settings.STORAGE_MODE == "backblaze"

    @staticmethod
    def _sanitize_filename(file_name: str) -> str:
        """Validate and sanitize file names to prevent path traversal and ensure safe cloud object keys."""
        if not file_name or not isinstance(file_name, str):
            raise ValueError("Filename must be a non-empty string.")
        # Strip path traversal and extract base name
        base_name = os.path.basename(file_name.strip().replace("\\", "/"))
        # Clean unsafe characters while preserving dots and dashes
        cleaned = re.sub(r"[^a-zA-Z0-9_\-\.]", "_", base_name)
        if not cleaned or cleaned.replace(".", "").replace("_", "") == "":
            raise ValueError("Filename contains no valid characters.")
        return cleaned

    def initialize_b2(self):
        """Initialize B2 SDK based on STORAGE_MODE and APP_ENV."""
        prod_mode = self.is_production_mode()
        has_keys = bool(settings.B2_APPLICATION_KEY_ID and settings.B2_APPLICATION_KEY)

        if has_keys:
            try:
                from b2sdk.v2 import InMemoryAccountInfo, B2Api
                info = InMemoryAccountInfo()
                self.b2_api = B2Api(info)
                self.b2_api.authorize_account("production", settings.B2_APPLICATION_KEY_ID, settings.B2_APPLICATION_KEY)
                self.bucket = self.b2_api.get_bucket_by_name(settings.B2_BUCKET_NAME)
                logger.info(f"Successfully connected to Backblaze B2 bucket: {settings.B2_BUCKET_NAME}")
            except Exception as e:
                logger.error(f"Failed to initialize Backblaze B2: {type(e).__name__}")
                if prod_mode:
                    raise RuntimeError(f"PRODUCTION STORAGE FAILURE: Backblaze B2 initialization failed: {type(e).__name__}")
                self.b2_api = None
                self.bucket = None
        else:
            if prod_mode:
                raise RuntimeError(
                    "PRODUCTION STORAGE FAILURE: B2_APPLICATION_KEY_ID and B2_APPLICATION_KEY are required "
                    "when STORAGE_MODE=backblaze or APP_ENV=production."
                )
            logger.info("STORAGE_MODE=mock active. Operating using development local storage adapter.")

    def is_cloud_connected(self) -> bool:
        return self.bucket is not None

    def get_status(self) -> Dict[str, Any]:
        if self.is_cloud_connected():
            return {
                "name": "Backblaze B2 Storage",
                "status": "CONNECTED",
                "details": f"MODE: {settings.STORAGE_MODE} | Bucket: {settings.B2_BUCKET_NAME}"
            }
        if self.is_production_mode():
            return {
                "name": "Backblaze B2 Storage",
                "status": "ERROR",
                "details": f"PRODUCTION FAILURE: B2 is disconnected while in production mode (STORAGE_MODE={settings.STORAGE_MODE}, APP_ENV={settings.APP_ENV})"
            }
        return {
            "name": "Backblaze B2 Storage",
            "status": "MOCK_STORAGE",
            "details": f"MODE: mock | Local Document Storage Active at {self.local_storage_dir}"
        }

    async def upload_file(self, file_name: str, file_data: bytes, content_type: str = "application/pdf") -> Dict[str, Any]:
        """Upload file data to B2 or local storage in development mode."""
        clean_name = self._sanitize_filename(file_name)
        if not isinstance(file_data, bytes) or len(file_data) == 0:
            raise ValueError("File data must be non-empty bytes.")

        if self.is_production_mode():
            if not self.bucket:
                raise RuntimeError("PRODUCTION STORAGE FAILURE: Backblaze B2 bucket is not connected.")
            try:
                file_info = self.bucket.upload_bytes(
                    data_bytes=file_data,
                    file_name=clean_name,
                    content_type=content_type
                )
                url = f"{settings.B2_ENDPOINT_URL.rstrip('/')}/{settings.B2_BUCKET_NAME}/{clean_name}"
                return {
                    "storage_provider": "backblaze_b2",
                    "file_id": getattr(file_info, "id_", getattr(file_info, "id", clean_name)),
                    "file_name": clean_name,
                    "url": url,
                    "size_bytes": len(file_data)
                }
            except Exception as e:
                logger.error(f"B2 upload error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION STORAGE FAILURE: B2 upload failed: {type(e).__name__}")

        # Development / Mock Mode
        if self.bucket:
            try:
                file_info = self.bucket.upload_bytes(
                    data_bytes=file_data,
                    file_name=clean_name,
                    content_type=content_type
                )
                url = f"{settings.B2_ENDPOINT_URL.rstrip('/')}/{settings.B2_BUCKET_NAME}/{clean_name}"
                return {
                    "storage_provider": "backblaze_b2",
                    "file_id": getattr(file_info, "id_", getattr(file_info, "id", clean_name)),
                    "file_name": clean_name,
                    "url": url,
                    "size_bytes": len(file_data)
                }
            except Exception as e:
                logger.warning(f"B2 upload failed in mock mode, falling back to local storage: {e}")

        local_path = os.path.join(self.local_storage_dir, clean_name)
        try:
            with open(local_path, "wb") as f:
                f.write(file_data)
            return {
                "storage_provider": "local_dev",
                "file_id": f"local_{clean_name}",
                "file_name": clean_name,
                "url": f"/api/v1/documents/local/{clean_name}",
                "size_bytes": len(file_data)
            }
        except Exception as e:
            logger.error(f"Local storage write error: {type(e).__name__}")
            raise

    async def download_file(self, file_name: str) -> bytes:
        """Download file content by name."""
        clean_name = self._sanitize_filename(file_name)
        if self.is_production_mode():
            if not self.bucket:
                raise RuntimeError("PRODUCTION STORAGE FAILURE: Backblaze B2 bucket is not connected.")
            try:
                dest = io.BytesIO()
                downloaded = self.bucket.download_file_by_name(clean_name)
                downloaded.save(dest)
                return dest.getvalue()
            except Exception as e:
                logger.error(f"B2 download error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION STORAGE FAILURE: B2 download failed: {type(e).__name__}")

        if self.bucket:
            try:
                dest = io.BytesIO()
                downloaded = self.bucket.download_file_by_name(clean_name)
                downloaded.save(dest)
                return dest.getvalue()
            except Exception:
                pass

        local_path = os.path.join(self.local_storage_dir, clean_name)
        if os.path.exists(local_path):
            with open(local_path, "rb") as f:
                return f.read()
        raise FileNotFoundError(f"Document {clean_name} not found in storage.")

    async def delete_file(self, file_name: str) -> bool:
        """Delete file from storage."""
        clean_name = self._sanitize_filename(file_name)
        if self.is_production_mode():
            if not self.bucket:
                raise RuntimeError("PRODUCTION STORAGE FAILURE: Backblaze B2 bucket is not connected.")
            try:
                file_info = self.bucket.get_file_info_by_name(clean_name)
                self.bucket.delete_file_version(file_info.id_, clean_name)
                return True
            except Exception as e:
                logger.error(f"B2 delete error: {type(e).__name__}")
                raise RuntimeError(f"PRODUCTION STORAGE FAILURE: B2 delete failed: {type(e).__name__}")

        if self.bucket:
            try:
                file_info = self.bucket.get_file_info_by_name(clean_name)
                self.bucket.delete_file_version(file_info.id_, clean_name)
                return True
            except Exception:
                pass

        local_path = os.path.join(self.local_storage_dir, clean_name)
        if os.path.exists(local_path):
            try:
                os.remove(local_path)
                return True
            except Exception:
                return False
        return True


backblaze_service = BackblazeB2Service()
BackblazeService = BackblazeB2Service
