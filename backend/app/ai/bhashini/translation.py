import logging
import httpx
from typing import Optional
from app.config import settings
from app.ai.bhashini.client import bhashini_client

logger = logging.getLogger("IP-SAKTI.BhashiniNMT")

class BhashiniTranslationAdapter:
    """
    BHASHINI NMT Text Translation Adapter.
    Translates queries and responses across Indian languages and English.
    Enforces explicit failure handling without silent pseudo-success fallbacks.
    """

    async def translate(self, text: str, source_lang: str, target_lang: str) -> str:
        """Translate text from source_lang to target_lang."""
        if not text or not text.strip() or source_lang == target_lang:
            return text

        # Explicit Mock Mode
        if settings.VOICE_PROVIDER == "mock":
            logger.info(f"[DEV MOCK] Bhashini NMT translating {source_lang} -> {target_lang}")
            return f"[{target_lang.upper()}] {text}"

        if not bhashini_client.are_credentials_present():
            logger.error(f"Bhashini translation failed: CREDENTIALS_MISSING (cannot translate {source_lang} -> {target_lang})")
            raise RuntimeError("Bhashini translation failed: CREDENTIALS_MISSING")

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
                res = await client.post(
                    bhashini_client.base_url,
                    headers=bhashini_client.get_auth_headers(),
                    json=payload
                )
                if res.status_code == 200:
                    data = res.json()
                    outputs = data.get("pipelineResponse", [{}])[0].get("output", [])
                    if outputs and outputs[0].get("target"):
                        target_text = outputs[0].get("target")
                        if target_text.strip():
                            return target_text
                    logger.error("Bhashini NMT returned 200 OK with empty translation payload.")
                    raise RuntimeError("Bhashini translation returned empty target text")
                else:
                    logger.error(f"Bhashini NMT API request rejected with HTTP {res.status_code}")
                    raise RuntimeError(f"Bhashini translation API rejected with HTTP {res.status_code}")
        except httpx.ConnectError:
            logger.error("Bhashini translation network failure: API_UNREACHABLE")
            raise RuntimeError("Bhashini translation failed: API_UNREACHABLE")
        except RuntimeError:
            raise
        except Exception as e:
            logger.error(f"Bhashini translation failed with exception: {type(e).__name__} - {e}")
            raise RuntimeError(f"Bhashini translation failed: {type(e).__name__}")

bhashini_translation = BhashiniTranslationAdapter()

