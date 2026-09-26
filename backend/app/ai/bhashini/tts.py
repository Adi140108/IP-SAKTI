import logging
import httpx
from typing import Optional
from app.ai.bhashini.client import bhashini_client

logger = logging.getLogger("IP-SAKTI.BhashiniTTS")

class BhashiniTTSAdapter:
    """
    BHASHINI Text-to-Speech (TTS) Adapter for read aloud audio playback.
    """

    async def text_to_speech(self, text: str, target_lang: str) -> Optional[str]:
        """Convert text to speech base64 audio."""
        if not bhashini_client.are_credentials_present() or not text.strip():
            return None

        headers = {
            "Content-Type": "application/json",
            "Authorization": bhashini_client.inference_key or bhashini_client.udyat_key or ""
        }
        payload = {
            "pipelineTasks": [
                {
                    "taskType": "tts",
                    "config": {
                        "language": {"sourceLanguage": target_lang},
                        "gender": "female"
                    }
                }
            ],
            "inputData": {
                "input": [{"source": text}]
            }
        }

        try:
            async with httpx.AsyncClient(timeout=20.0) as client:
                res = await client.post(bhashini_client.base_url, headers=headers, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    outputs = data.get("pipelineResponse", [{}])[0].get("audio", [])
                    if outputs and outputs[0].get("audioContent"):
                        return outputs[0].get("audioContent")
                return None
        except Exception as e:
            logger.error(f"Bhashini TTS error: {e}")
            return None

bhashini_tts = BhashiniTTSAdapter()
