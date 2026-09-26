from typing import Dict, Any, Optional
from app.ai.bhashini.client import bhashini_client
from app.ai.bhashini.translation import bhashini_translation
from app.ai.bhashini.asr import bhashini_asr
from app.ai.bhashini.tts import bhashini_tts
from app.ai.bhashini.ocr import bhashini_ocr

class BhashiniService:
    """
    Unified Facade for BHASHINI services.
    Delegates calls to isolated adapters (client, translation, ASR, TTS, OCR).
    """

    def is_configured(self) -> bool:
        return bhashini_client.are_credentials_present()

    async def get_status(self) -> Dict[str, Any]:
        return await bhashini_client.test_service_reachability()

    async def translate_text(self, text: str, source_lang: str, target_lang: str) -> str:
        return await bhashini_translation.translate(text, source_lang, target_lang)

    async def speech_to_text(self, audio_base64: str, source_lang: str) -> Optional[str]:
        return await bhashini_asr.speech_to_text(audio_base64, source_lang)

    async def text_to_speech(self, text: str, target_lang: str) -> Optional[str]:
        return await bhashini_tts.text_to_speech(text, target_lang)

    async def perform_ocr(self, image_base64: str, language: str = "hi") -> Optional[str]:
        return await bhashini_ocr.perform_ocr(image_base64, language)

bhashini_service = BhashiniService()
