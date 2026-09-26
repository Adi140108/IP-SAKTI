import logging
import httpx
from typing import Optional
from app.config import settings
from app.ai.bhashini.client import bhashini_client

logger = logging.getLogger("IP-SAKTI.BhashiniASR")

class BhashiniASRAdapter:
    """
    BHASHINI Speech-to-Text (ASR) Adapter for voice query processing.
    Converts audio base64 payload to transcription via Bhashini Dhruva ASR service.
    """

    async def speech_to_text(self, audio_base64: str, source_lang: str = "hi") -> Optional[str]:
        """Convert speech audio to text."""
        if not audio_base64 or not audio_base64.strip():
            return None

        # Explicit Mock / Test mode check
        if settings.VOICE_PROVIDER == "mock":
            logger.info(f"[DEV MOCK] Bhashini ASR mock transcript generated for lang: {source_lang}")
            return f"Ayurvedic patent inquiry ({source_lang})"

        if not bhashini_client.are_credentials_present():
            logger.error("Bhashini ASR failed: CREDENTIALS_MISSING (BHASHINI_INFERENCE_KEY / BHASHINI_UDYAT_KEY not configured)")
            return None

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "asr",
                    "config": {
                        "language": {"sourceLanguage": source_lang},
                        "audioFormat": "wav"
                    }
                }
            ],
            "inputData": {
                "audio": [{"audioContent": audio_base64}]
            }
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(
                    bhashini_client.base_url,
                    headers=bhashini_client.get_auth_headers(),
                    json=payload
                )
                if res.status_code == 200:
                    data = res.json()
                    outputs = data.get("pipelineResponse", [{}])[0].get("output", [])
                    if outputs and outputs[0].get("source"):
                        return outputs[0].get("source")
                    elif outputs and outputs[0].get("text"):
                        return outputs[0].get("text")
                    logger.error("Bhashini ASR response contained 200 OK but empty transcript payload.")
                    return None
                else:
                    logger.error(f"Bhashini ASR API request rejected with HTTP {res.status_code}")
                    return None
        except httpx.ConnectError:
            logger.error("Bhashini ASR network failure: API_UNREACHABLE")
            return None
        except Exception as e:
            logger.error(f"Bhashini ASR execution failed: {type(e).__name__} - {e}")
            return None

bhashini_asr = BhashiniASRAdapter()

