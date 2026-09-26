import os
import logging
from typing import Dict, Any, Optional
from app.config import settings

logger = logging.getLogger("IP-SAKTI.BackblazeB2")

class BackblazeB2Service:
    """
    Backblaze B2 Document Storage Service.
    Supports STORAGE_MODE = "backblaze" (production) vs "mock" (development).
    In production mode, storage failures raise explicit un-swallowed exceptions.
    """

    def __init__(self):
        self.b2_api = None
        self.bucket = None
        self.local_storage_dir = os.path.abspath("./data/local_storage")
        os.makedirs(self.local_storage_dir, exist_ok=True)
        self.initialize_b2()

    def initialize_b2(self):
        """Initialize B2 SDK if credentials present."""
        is_prod = settings.APP_ENV == "production" or settings.STORAGE_MODE == "backblaze"
        if settings.B2_APPLICATION_KEY_ID and settings.B2_APPLICATION_KEY:
            try:
                from b2sdk.v2 import InMemoryAccountInfo, B2Api
                info = InMemoryAccountInfo()
                self.b2_api = B2Api(info)
                self.b2_api.authorize_account("production", settings.B2_APPLICATION_KEY_ID, settings.B2_APPLICATION_KEY)
                self.bucket = self.b2_api.get_bucket_by_name(settings.B2_BUCKET_NAME)
                logger.info(f"Connected to Backblaze B2 bucket: {settings.B2_BUCKET_NAME}")
            except Exception as e:
                logger.error(f"Failed to initialize Backblaze B2: {e}")
                if is_prod:
                    raise RuntimeError(f"PRODUCTION STORAGE FAILURE: Backblaze B2 initialization failed: {e}")
                self.b2_api = None
                self.bucket = None
        else:
            if is_prod:
                raise RuntimeError("PRODUCTION STORAGE FAILURE: B2_APPLICATION_KEY_ID/KEY missing in production mode.")
            logger.info("STORAGE_MODE=mock active. Operating using development local storage adapter.")

    def is_cloud_connected(self) -> bool:
        return self.bucket is not None

    def get_status(self) -> Dict[str, Any]:
        if self.is_cloud_connected():
            return {
                "name": "Backblaze B2 Storage",
                "status": "CONNECTED",
                "details": f"MODE: backblaze | Bucket: {settings.B2_BUCKET_NAME}"
            }
        return {
            "name": "Backblaze B2 Storage",
            "status": "NOT_CONFIGURED",
            "details": f"MODE: mock | Local Document Storage Active at {self.local_storage_dir}"
        }

    async def upload_file(self, file_name: str, file_data: bytes, content_type: str = "application/pdf") -> Dict[str, Any]:
        """Upload file data to B2 or local fallback storage."""
        if self.bucket:
            try:
                file_info = self.bucket.upload_bytes(
                    data_bytes=file_data,
                    file_name=file_name,
                    content_type=content_type
                )
                url = f"{settings.B2_ENDPOINT_URL}/{settings.B2_BUCKET_NAME}/{file_name}"
                return {
                    "storage_provider": "backblaze_b2",
                    "file_id": file_info.id_,
                    "file_name": file_name,
                    "url": url,
                    "size_bytes": len(file_data)
                }
            except Exception as e:
                logger.error(f"B2 upload error: {e}")
                if settings.APP_ENV == "production" or settings.STORAGE_MODE == "backblaze":
                    raise RuntimeError(f"PRODUCTION STORAGE FAILURE: B2 upload failed: {e}")

        # Local storage fallback
        local_path = os.path.join(self.local_storage_dir, file_name)
        with open(local_path, "wb") as f:
            f.write(file_data)

        return {
            "storage_provider": "local_dev",
            "file_id": f"local_{file_name}",
            "file_name": file_name,
            "url": f"/api/v1/documents/local/{file_name}",
            "size_bytes": len(file_data)
        }

backblaze_service = BackblazeB2Service()
