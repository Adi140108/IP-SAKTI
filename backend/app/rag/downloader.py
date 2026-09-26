import hashlib
import logging
from typing import Dict, Any, Optional
import httpx
from app.rag.source_registry import is_authority_allowed

logger = logging.getLogger("IP-SAKTI.DocumentDownloader")

class DownloadResult:
    def __init__(
        self,
        success: bool,
        url: str,
        content_bytes: bytes = b"",
        checksum: str = "",
        content_type: str = "text/plain",
        size_bytes: int = 0,
        error: Optional[str] = None
    ):
        self.success = success
        self.url = url
        self.content_bytes = content_bytes
        self.checksum = checksum
        self.content_type = content_type
        self.size_bytes = size_bytes
        self.error = error

class DocumentDownloader:
    """
    Isolated, secure document downloader for authoritative legal and statutory publications.
    Enforces HTTPS, domain allowlist, timeouts, size limits, and cryptographic SHA-256 byte hashing.
    """

    def __init__(self, timeout_seconds: float = 15.0, max_size_bytes: int = 25 * 1024 * 1024):
        self.timeout_seconds = timeout_seconds
        self.max_size_bytes = max_size_bytes

    async def download_source_document(self, url: str, validate_authority: bool = True) -> DownloadResult:
        """Download source document from an approved authority and compute its SHA-256 checksum."""
        if not url:
            return DownloadResult(success=False, url=url, error="URL is empty")

        # 1. Enforce HTTPS (allow localhost/testserver in testing)
        is_local = any(url.startswith(p) for p in ["http://localhost", "http://127.0.0.1", "http://testserver"])
        if not url.startswith("https://") and not is_local:
            err = f"INSECURE_PROTOCOL: Only HTTPS downloads are permitted for authoritative legal sources: {url}"
            logger.error(err)
            return DownloadResult(success=False, url=url, error=err)

        # 2. Authority Allowlist Validation
        if validate_authority and not is_authority_allowed(url):
            err = f"UNAUTHORIZED_SOURCE: Domain for {url} is not an approved government/statutory repository."
            logger.error(err)
            return DownloadResult(success=False, url=url, error=err)

        # 3. Secure HTTP Fetch
        try:
            headers = {
                "User-Agent": "IP-SAKTI-Legal-Ingestion/1.0 (AYUSH-IP-RAG; +https://ip-sakti.gov.in)"
            }
            async with httpx.AsyncClient(timeout=self.timeout_seconds, follow_redirects=True) as client:
                response = await client.get(url, headers=headers)
                if response.status_code != 200:
                    err = f"HTTP_ERROR: Server returned status code {response.status_code} for {url}"
                    logger.error(err)
                    return DownloadResult(success=False, url=url, error=err)

                raw_bytes = response.content
                if not raw_bytes or len(raw_bytes.strip()) == 0:
                    err = f"EMPTY_DOCUMENT: Retrieved 0 bytes from {url}"
                    logger.error(err)
                    return DownloadResult(success=False, url=url, error=err)

                if len(raw_bytes) > self.max_size_bytes:
                    err = f"SIZE_LIMIT_EXCEEDED: Document size {len(raw_bytes)} bytes exceeds limit {self.max_size_bytes}"
                    logger.error(err)
                    return DownloadResult(success=False, url=url, error=err)

                # 4. Compute Cryptographic SHA-256 on ACTUAL DOWNLOADED BYTES
                checksum = hashlib.sha256(raw_bytes).hexdigest()
                content_type = response.headers.get("content-type", "text/plain").split(";")[0].strip()

                logger.info(f"Downloaded {len(raw_bytes)} bytes from {url} (SHA256: {checksum[:12]}...)")
                return DownloadResult(
                    success=True,
                    url=url,
                    content_bytes=raw_bytes,
                    checksum=checksum,
                    content_type=content_type,
                    size_bytes=len(raw_bytes)
                )

        except httpx.TimeoutException as e:
            err = f"TIMEOUT: Request to {url} timed out after {self.timeout_seconds}s: {e}"
            logger.error(err)
            return DownloadResult(success=False, url=url, error=err)
        except Exception as e:
            err = f"DOWNLOAD_FAILED: Could not download {url}: {e}"
            logger.error(err)
            return DownloadResult(success=False, url=url, error=err)

document_downloader = DocumentDownloader()
