import logging
import httpx
from typing import Optional
from app.ai.bhashini.client import bhashini_client

logger = logging.getLogger("IP-SAKTI.BhashiniASR")

class BhashiniASRAdapter:
    """
    BHASHINI Speech-to-Text (ASR) Adapter for voice query processing.
    """

    async def speech_to_text(self, audio_base64: str, source_lang: str) -> Optional[str]:
        """Convert speech audio to text."""
        if not bhashini_client.are_credentials_present():
            logger.info(f"[DEV MOCK] Bhashini ASR called for lang: {source_lang}")
            return None

        headers = {
            "Content-Type": "application/json",
            "Authorization": bhashini_client.inference_key or bhashini_client.udyat_key or ""
        }
        payload = {
            "pipelineTasks": [
                {
                    "taskType": "asr",
                    "config": {
                        "language": {"sourceLanguage": source_lang}
                    }
                }
            ],
            "inputData": {
                "audio": [{"audioContent": audio_base64}]
            }
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(bhashini_client.base_url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    outputs = data.get("pipelineResponse", [{}])[0].get("output", [])
                    if outputs and outputs[0].get("source"):
                        return outputs[0].get("source")
                return None
        except Exception as e:
            logger.error(f"Bhashini ASR error: {e}")
            return None

bhashini_asr = BhashiniASRAdapter()
