import json
import logging
from typing import Dict, Any, List, Optional
import httpx
from app.config import settings
from app.ai.base import LLMProvider
from app.ai.groq.provider import groq_provider

logger = logging.getLogger("IP-SAKTI.LLMProvider")

class GemmaProvider(LLMProvider):
    """
    Unified Hybrid Provider for IP-SAKTI.
    PRIMARY: Groq API (openai/gpt-oss-120b / qwen/qwen3.8-27b) for lightning-fast, highly authoritative reasoning.
    FALLBACK: Gemma 4 12B via local Ollama API.
    """

    def __init__(self):
        self.base_url = settings.OLLAMA_BASE_URL.rstrip('/')
        self.model = settings.OLLAMA_MODEL
        self.timeout = settings.OLLAMA_TIMEOUT_SECONDS

    async def check_availability(self) -> Dict[str, Any]:
        """Check availability of both primary Groq API and fallback Gemma/Ollama service."""
        groq_status = await groq_provider.check_availability()
        ollama_status = {"available": False}
        
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{self.base_url}/api/tags")
                if res.status_code == 200:
                    models_info = res.json().get("models", [])
                    available_models = [m.get("name") for m in models_info]
                    model_found = any(self.model.split(':')[0] in m for m in available_models)
                    ollama_status = {
                        "available": True,
                        "model": self.model,
                        "model_present": model_found,
                        "all_models": available_models
                    }
                else:
                    ollama_status = {"available": False, "error": f"Ollama HTTP {res.status_code}"}
        except Exception as e:
            ollama_status = {"available": False, "error": str(e)}

        primary_available = groq_status.get("available", False)
        active_provider = "groq" if primary_available else ("ollama" if ollama_status.get("available") else "none")

        return {
            "available": primary_available or ollama_status.get("available", False),
            "active_provider": active_provider,
            "groq": groq_status,
            "ollama": ollama_status
        }

    async def supports_vision(self) -> bool:
        """Check if vision is supported via local Gemma Vision fallback."""
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
        """
        Generate raw text response.
        Attempts Groq API primary first; falls back to Gemma/Ollama on error.
        """
        # 1. Primary Attempt: Groq API
        if settings.GROQ_API_KEY:
            try:
                text = await groq_provider.generate_text(prompt=prompt, system_prompt=system_prompt)
                logger.info("Successfully generated text via Groq API (Primary LLM Provider)")
                return text
            except Exception as e:
                logger.warning(f"Groq API primary provider failed ({e}). Falling back to Gemma 4 12B via Ollama.")

        # 2. Secondary Fallback: Gemma 4 12B via Ollama
        return await self._generate_text_ollama(prompt=prompt, system_prompt=system_prompt)

    async def _generate_text_ollama(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Generate text using local Ollama instance."""
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
                    logger.info("Successfully generated text via Gemma/Ollama (Fallback LLM Provider)")
                    return data.get("response", "").strip()
                else:
                    logger.error(f"Ollama returned status {res.status_code}: {res.text}")
                    raise RuntimeError(f"Ollama API Error: HTTP {res.status_code}")
        except Exception as e:
            logger.error(f"Gemma/Ollama call failed ({type(e).__name__}): {e or repr(e)}")
            raise e

    async def generate_structured_json(self, prompt: str, system_prompt: str) -> Dict[str, Any]:
        """
        Generate structured JSON response.
        Attempts Groq API primary first; falls back to Gemma/Ollama on error.
        """
        # 1. Primary Attempt: Groq API
        if settings.GROQ_API_KEY:
            try:
                structured_data = await groq_provider.generate_structured_json(prompt=prompt, system_prompt=system_prompt)
                logger.info("Successfully generated structured JSON via Groq API")
                return structured_data
            except Exception as e:
                logger.warning(f"Groq API structured JSON failed ({e}). Falling back to Gemma/Ollama.")

        # 2. Secondary Fallback: Gemma 4 12B via Ollama
        full_system_prompt = system_prompt + "\n\nCRITICAL: Respond ONLY with valid JSON. Do not include markdown codeblocks, explanations, or prose."
        raw_output = await self._generate_text_ollama(prompt=prompt, system_prompt=full_system_prompt)
        
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
            logger.warning(f"Failed to parse Gemma JSON directly. Output snippet: {cleaned_output[:200]}")
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
