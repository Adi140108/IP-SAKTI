import logging
import httpx
from typing import Optional
from app.config import settings
from app.ai.bhashini.client import bhashini_client

logger = logging.getLogger("IP-SAKTI.BhashiniTTS")

class BhashiniTTSAdapter:
    """
    BHASHINI Text-to-Speech (TTS) Adapter for read aloud audio playback.
    Synthesizes speech audio from text using Bhashini Dhruva TTS service.
    """

    async def text_to_speech(self, text: str, target_lang: str = "hi", gender: str = "female") -> Optional[str]:
        """Convert text to speech base64 audio."""
        if not text or not text.strip():
            return None

        # Explicit Mock Mode
        if settings.VOICE_PROVIDER == "mock":
            logger.info(f"[DEV MOCK] Bhashini TTS audio generated for lang: {target_lang}")
            return "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="

        if not bhashini_client.are_credentials_present():
            logger.error("Bhashini TTS failed: CREDENTIALS_MISSING (BHASHINI_INFERENCE_KEY / BHASHINI_UDYAT_KEY not configured)")
            return None

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "tts",
                    "config": {
                        "language": {"sourceLanguage": target_lang},
                        "gender": gender
                    }
                }
            ],
            "inputData": {
                "input": [{"source": text[:500]}]
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
                    outputs = data.get("pipelineResponse", [{}])[0].get("audio", [])
                    if outputs and outputs[0].get("audioContent"):
                        audio_b64 = outputs[0].get("audioContent", "")
                        if len(audio_b64.strip()) > 10:
                            return audio_b64
                    logger.error("Bhashini TTS returned 200 OK but audio content payload was empty.")
                    return None
                else:
                    logger.error(f"Bhashini TTS API request rejected with HTTP {res.status_code}")
                    return None
        except httpx.ConnectError:
            logger.error("Bhashini TTS network failure: API_UNREACHABLE")
            return None
        except Exception as e:
            logger.error(f"Bhashini TTS error: {type(e).__name__} - {e}")
            return None

bhashini_tts = BhashiniTTSAdapter()

