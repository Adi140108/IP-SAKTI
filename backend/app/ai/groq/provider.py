import json
import logging
from typing import Dict, Any, Optional
import httpx
from app.config import settings
from app.ai.base import LLMProvider

logger = logging.getLogger("IP-SAKTI.Groq")

class GroqProvider(LLMProvider):
    """
    Primary LLM Provider using Groq API (High-performance inference).
    Model: openai/gpt-oss-120b (Primary) with fallback to qwen/qwen3.8-27b.
    """

    def __init__(self):
        self.api_key = settings.GROQ_API_KEY
        self.model = settings.GROQ_MODEL or "openai/gpt-oss-120b"
        self.base_url = settings.GROQ_BASE_URL.rstrip('/')

    async def check_availability(self) -> Dict[str, Any]:
        """Check if Groq API key is present and service is reachable."""
        if not settings.GROQ_API_KEY:
            return {"available": False, "error": "GROQ_API_KEY is not configured"}

        url = f"{self.base_url}/models"
        headers = {
            "Authorization": f"Bearer {settings.GROQ_API_KEY}",
            "User-Agent": "IP-SAKTI/1.0"
        }
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(url, headers=headers)
                if res.status_code == 200:
                    models = [m.get("id") for m in res.json().get("data", [])]
                    model_found = self.model in models
                    return {
                        "available": True,
                        "model": self.model,
                        "model_present": model_found,
                        "available_models": models
                    }
                return {"available": False, "error": f"Groq API HTTP {res.status_code}: {res.text}"}
        except Exception as e:
            return {"available": False, "error": str(e)}

    async def generate_text(self, prompt: str, system_prompt: Optional[str] = None) -> str:
        """Generate raw text response via Groq API."""
        if not settings.GROQ_API_KEY:
            raise RuntimeError("GROQ_API_KEY_MISSING: Cannot invoke Groq API without API key.")

        url = f"{self.base_url}/chat/completions"
        headers = {
            "Authorization": f"Bearer {settings.GROQ_API_KEY}",
            "Content-Type": "application/json",
            "User-Agent": "IP-SAKTI/1.0"
        }

        messages = []
        if system_prompt:
            messages.append({"role": "system", "content": system_prompt})
        messages.append({"role": "user", "content": prompt})

        payload = {
            "model": self.model,
            "messages": messages,
            "temperature": 0.2,
            "top_p": 0.9
        }

        timeout_config = httpx.Timeout(60.0, connect=5.0)
        try:
            async with httpx.AsyncClient(timeout=timeout_config) as client:
                res = await client.post(url, json=payload, headers=headers)
                if res.status_code == 200:
                    data = res.json()
                    choices = data.get("choices", [])
                    if choices:
                        return choices[0].get("message", {}).get("content", "").strip()
                    raise RuntimeError("Groq returned empty choices payload.")
                
                # If primary model unavailable or rate-limited (HTTP 429/404/400), attempt fallback Groq models
                if res.status_code in (429, 404, 400):
                    fallback_models = ["openai/gpt-oss-20b", "qwen/qwen3.8-27b", "openai/gpt-oss-120b"]
                    for alt_model in fallback_models:
                        if alt_model != payload["model"]:
                            logger.warning(f"Groq API model {payload['model']} returned HTTP {res.status_code}. Retrying with {alt_model}.")
                            payload["model"] = alt_model
                            res2 = await client.post(url, json=payload, headers=headers)
                            if res2.status_code == 200:
                                return res2.json().get("choices", [])[0].get("message", {}).get("content", "").strip()

                logger.error(f"Groq API returned HTTP {res.status_code}: {res.text}")
                raise RuntimeError(f"Groq API Error: HTTP {res.status_code}")
        except Exception as e:
            logger.error(f"Groq API execution failed ({type(e).__name__}): {e or repr(e)}")
            raise e

    async def generate_structured_json(self, prompt: str, system_prompt: str) -> Dict[str, Any]:
        """Generate structured JSON response via Groq API."""
        full_system_prompt = (
            system_prompt + 
            "\n\nCRITICAL REQUIREMENT: Respond ONLY with valid JSON. "
            "Do not include markdown codeblocks, explanations, or introductory text."
        )
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
            return json.loads(cleaned_output, strict=False)
        except Exception as e:
            first_brace = cleaned_output.find('{')
            last_brace = cleaned_output.rfind('}')
            if first_brace != -1 and last_brace != -1 and last_brace > first_brace:
                snippet = cleaned_output[first_brace:last_brace + 1]
                try:
                    return json.loads(snippet, strict=False)
                except Exception:
                    try:
                        import re
                        # Fix unescaped newlines inside quotes
                        fixed_snippet = re.sub(r'(?<=: ")[\s\S]*?(?=",\n|"\n|\"\})', lambda m: m.group(0).replace('\n', '\\n').replace('\r', '\\r'), snippet)
                        return json.loads(fixed_snippet, strict=False)
                    except Exception:
                        pass
            raise ValueError(f"Groq model output could not be parsed as valid JSON: {str(e)}")

groq_provider = GroqProvider()
