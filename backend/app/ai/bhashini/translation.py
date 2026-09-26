import logging
import httpx
from typing import Optional
from app.ai.bhashini.client import bhashini_client

logger = logging.getLogger("IP-SAKTI.BhashiniNMT")

class BhashiniTranslationAdapter:
    """
    BHASHINI NMT Text Translation Adapter.
    Translates queries and responses across Indian languages and English.
    """

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate text from source_lang to target_lang."""
        if source_lang == target_lang or not text.strip():
            return text

        if not bhashini_client.are_credentials_present():
            logger.info(f"[DEV MOCK] Bhashini NMT translating from {source_lang} to {target_lang}")
            return text

        headers = {
            "Content-Type": "application/json",
            "Authorization": bhashini_client.inference_key or bhashini_client.udyat_key or ""
        }
        payload = {
            "pipelineTasks": [
                {
                    "taskType": "translation",
                    "config": {
                        "language": {
                            "sourceLanguage": source_lang,
                            "targetLanguage": target_lang
                        }
                    }
                }
            ],
            "inputData": {
                "input": [{"source": text}]
            }
        }

        try:
            async with httpx.AsyncClient(timeout=15.0) as client:
                res = await client.post(bhashini_client.base_url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    outputs = data.get("pipelineResponse", [{}])[0].get("output", [])
                    if outputs and outputs[0].get("target"):
                        return outputs[0].get("target")
                logger.warning(f"Bhashini NMT returned HTTP {res.status_code}")
                return text
        except Exception as e:
            logger.error(f"Bhashini translation failed: {e}")
            return text

bhashini_translation = BhashiniTranslationAdapter()
