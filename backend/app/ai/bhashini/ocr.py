import logging
import httpx
from typing import Optional
from app.ai.bhashini.client import bhashini_client

logger = logging.getLogger("IP-SAKTI.BhashiniOCR")

class BhashiniOCRAdapter:
    """
    BHASHINI Optical Character Recognition (OCR) Adapter for image/document text extraction.
    """

    async def perform_ocr(self, image_base64: str, language: str = "hi") -> Optional[str]:
        """Perform OCR on a single page image base64 string."""
        if not bhashini_client.are_credentials_present():
            logger.info("[DEV MOCK] Bhashini OCR called (unconfigured, will trigger fallback)")
            return None

        headers = {
            "Content-Type": "application/json",
            "Authorization": bhashini_client.inference_key or bhashini_client.udyat_key or ""
        }
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
                res = await client.post(bhashini_client.base_url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    outputs = data.get("pipelineResponse", [{}])[0].get("output", [])
                    if outputs and outputs[0].get("source"):
                        return outputs[0].get("source")
                return None
        except Exception as e:
            logger.error(f"Bhashini OCR failed: {e}")
            return None

bhashini_ocr = BhashiniOCRAdapter()
