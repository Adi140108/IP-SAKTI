import json
import logging
from typing import Dict, Any, List, Optional
import httpx
from app.config import settings
from app.ai.base import LLMProvider

logger = logging.getLogger("IP-SAKTI.GemmaVision")

class GemmaProvider(LLMProvider):
    """
    Local Gemma / Ollama Multimodal Provider.
    Retained EXCLUSIVELY for local multimodal vision and OCR fallback capabilities.
    Normal text and structured legal reasoning is handled directly by GroqProvider.
    """

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip('/')
        self.model = settings.OLLAMA_MODEL
        self.timeout = settings.OLLAMA_TIMEOUT_SECONDS

    async def check_availability(self) -> Dict[str, Any]:
        """Check availability of local Ollama vision service."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    models_info = res.json().get("models", [])
                    available_models = [m.get("name") for m in models_info]
                    model_found = any(self.model.split(':')[0] in m for m in available_models)
                    return {
                        "available": True,
                        "model": self.model,
                        "model_present": model_found,
                        "all_models": available_models
                    }
                else:
                    return {"available": False, "error": f"Ollama HTTP {res.status_code}"}
        except Exception as e:
            return {"available": False, "error": str(e)}

    async def supports_vision(self) -> bool:
        """Check if vision is supported via local Gemma Vision."""
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    models_info = res.json().get("models", [])
                    return any("gemma" in m.get("name", "").lower() for m in models_info)
        except Exception:
            pass
        return False

    async def generate_text(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Generate text using local Ollama instance (retained for standalone local tests)."""
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.2,
                "top_p": 0.9
            }
        }
        if system_prompt:
            payload["system"] = system_prompt

        timeout_config = httpx.Timeout(settings.OLLAMA_TIMEOUT_SECONDS, connect=5.0)
        try:
            async with httpx.AsyncClient(timeout=timeout_config) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    data = res.json()
                    return data.get("response", "").strip()
                else:
                    raise RuntimeError(f"Ollama API Error: HTTP {res.status_code}")
        except Exception as e:
            logger.error(f"Gemma/Ollama call failed ({type(e).__name__}): {e or repr(e)}")
            raise e

    async def generate_structured_json(self, prompt: str, system_prompt: str) -> Dict[str, Any]:
        """Generate structured JSON via local Ollama instance (retained for standalone local tests)."""
        full_system_prompt = system_prompt + "\n\nCRITICAL: Respond ONLY with valid JSON. Do not include markdown codeblocks, explanations, or prose."
        raw_output = await self.generate_text(prompt=prompt, system_prompt=full_system_prompt)
        
        cleaned_output = raw_output.strip()
        if cleaned_output.startswith("```json"):
            cleaned_output = cleaned_output[7:]
        elif cleaned_output.startswith("```"):
            cleaned_output = cleaned_output[3:]
        if cleaned_output.endswith("```"):
            cleaned_output = cleaned_output[:-3]
        cleaned_output = cleaned_output.strip()

        try:
            return json.loads(cleaned_output)
        except json.JSONDecodeError as e:
            first_brace = cleaned_output.find('{')
            last_brace = cleaned_output.rfind('}')
            if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                try:
                    return json.loads(cleaned_output[first_brace:last_brace + 1])
                except Exception:
                    pass
            raise ValueError(f"Gemma model did not return valid JSON: {str(e)}")

    async def extract_vision_text(self, image_base64: str, file_name: str) -> str:
        """Gemma Vision fallback for document OCR extraction when primary OCR fails."""
        if not await self.supports_vision():
            raise RuntimeError("VISION_MODEL_UNAVAILABLE: Configured Gemma model does not support multimodal vision.")

        prompt = (
            f"You are Gemma Vision OCR. Inspect the attached image document '{file_name}'. "
            "Extract all printed and handwritten text accurately in its original language. "
            "Do not omit section numbers, medicinal ingredient names, or dates."
        )
        url = f"{self.base_url}/api/generate"
        payload = {
            "model": self.model,
            "prompt": prompt,
            "images": [image_base64],
            "stream": False
        }
        try:
            async with httpx.AsyncClient(timeout=self.timeout * 2) as client:
                res = await client.post(url, json=payload)
                if res.status_code == 200:
                    return res.json().get("response", "").strip()
                raise RuntimeError(f"Gemma Vision failed: HTTP {res.status_code}")
        except Exception as e:
            logger.error(f"Gemma Vision OCR error: {e}")
            raise e

gemma_provider = GemmaProvider()

