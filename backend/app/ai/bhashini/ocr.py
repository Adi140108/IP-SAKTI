import logging
import httpx
from typing import Optional
from app.config import settings
from app.ai.bhashini.client import bhashini_client

logger = logging.getLogger("IP-SAKTI.BhashiniOCR")

class BhashiniOCRAdapter:
    """
    BHASHINI Optical Character Recognition (OCR) Adapter for image/document text extraction.
    Extracts text from single page image base64 payloads using Bhashini Dhruva OCR service.
    """

    async def perform_ocr(self, image_base64: str, language: str = "hi") -> Optional[str]:
        """Perform OCR on a single page image base64 string."""
        if not image_base64 or not image_base64.strip():
            return None

        # Explicit Mock Mode
        if settings.VOICE_PROVIDER == "mock":
            logger.info(f"[DEV MOCK] Bhashini OCR mock text generated for lang: {language}")
            return f"[MOCK OCR {language.upper()}] Standardized Ayurvedic extract specification content."

        if not bhashini_client.are_credentials_present():
            logger.warning("Bhashini OCR called without credentials in .env (will trigger fallback if available).")
            return None

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "ocr",
                    "config": {
                        "language": {"sourceLanguage": language}
                    }
                }
            ],
            "inputData": {
                "image": [{"imageContent": image_base64}]
            }
        }

        try:
            async with httpx.AsyncClient(timeout=30.0) as client:
                res = await client.post(
                    bhashini_client.base_url,
                    headers=bhashini_client.get_auth_headers(),
                    json=payload
                )
                if res.status_code == 200:
                    data = res.json()
                    outputs = data.get("pipelineResponse", [{}])[0].get("output", [])
                    if outputs:
                        extracted = outputs[0].get("source") or outputs[0].get("text")
                        if extracted and len(extracted.strip()) > 0:
                            return extracted.strip()
                    logger.warning("Bhashini OCR returned 200 OK but with empty output text.")
                    return None
                else:
                    logger.error(f"Bhashini OCR API request rejected with HTTP {res.status_code}")
                    return None
        except httpx.ConnectError:
            logger.error("Bhashini OCR network failure: API_UNREACHABLE")
            return None
        except Exception as e:
            logger.error(f"Bhashini OCR failed: {type(e).__name__} - {e}")
            return None

bhashini_ocr = BhashiniOCRAdapter()

