import logging
import time
import httpx
from datetime import datetime
from typing import Dict, Any, Optional, Tuple
from app.config import settings

logger = logging.getLogger("IP-SAKTI.BhashiniClient")

# Minimal audio sample (WAV header bytes in base64) for diagnostic ASR probe
TINY_WAV_BASE64 = (
    "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
)

# Minimal 1x1 PNG base64 for diagnostic OCR probe
TINY_PNG_BASE64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
)

class BhashiniClient:
    """
    BHASHINI Base API Client & Multi-Service Diagnostic Tester.
    Validates API reachability and independently tests ASR, NMT, TTS, and OCR services
    against Bhashini / Udyat Dhruva endpoints without credential leakage.
    """

    def __init__(self):
        self._last_diagnostics: Optional[Dict[str, Any]] = None
        self._last_diagnostics_time: float = 0.0
        self._cache_ttl_seconds: float = 60.0

    @property
    def udyat_key(self) -> Optional[str]:
        return settings.BHASHINI_UDYAT_KEY

    @property
    def inference_key(self) -> Optional[str]:
        return settings.BHASHINI_INFERENCE_KEY

    @property
    def api_key(self) -> Optional[str]:
        return settings.BHASHINI_API_KEY

    @property
    def user_id(self) -> Optional[str]:
        return settings.BHASHINI_USER_ID

    @property
    def base_url(self) -> str:
        url = settings.BHASHINI_BASE_URL.rstrip("/")
        if not url.endswith("/pipeline"):
            url = f"{url}/pipeline"
        return url

    @property
    def pipeline_id(self) -> Optional[str]:
        return settings.BHASHINI_PIPELINE_ID

    @property
    def asr_service_id(self) -> Optional[str]:
        return settings.BHASHINI_ASR_SERVICE_ID

    @property
    def ocr_service_id(self) -> Optional[str]:
        return settings.BHASHINI_OCR_SERVICE_ID

    @property
    def nmt_service_id(self) -> Optional[str]:
        return settings.BHASHINI_NMT_SERVICE_ID

    @property
    def tts_service_id(self) -> Optional[str]:
        return settings.BHASHINI_TTS_SERVICE_ID

    def are_credentials_present(self) -> bool:
        """Check if any valid Bhashini credential is configured."""
        return bool(self.inference_key or self.udyat_key or self.api_key)

    def get_auth_token(self) -> str:
        """Get the primary auth token without exposing it in logs."""
        return self.inference_key or self.udyat_key or self.api_key or ""

    def get_auth_headers(self) -> Dict[str, str]:
        """Build request headers for Bhashini Dhruva / Udyat API."""
        token = self.get_auth_token()
        headers = {
            "Content-Type": "application/json",
            "Authorization": token
        }
        if self.user_id:
            headers["userID"] = self.user_id
        if self.pipeline_id:
            headers["pipelineId"] = self.pipeline_id
        return headers

    def build_task_config(
        self,
        task_type: str,
        source_lang: str,
        target_lang: Optional[str] = None,
        gender: str = "female",
        audio_format: str = "wav",
        sampling_rate: int = 16000
    ) -> Dict[str, Any]:
        """
        Build standardized Bhashini Dhruva task configuration including serviceId if configured.
        """
        config: Dict[str, Any] = {}
        
        if task_type == "translation":
            config["language"] = {
                "sourceLanguage": source_lang,
                "targetLanguage": target_lang or "hi"
            }
            if self.nmt_service_id:
                config["serviceId"] = self.nmt_service_id

        elif task_type == "asr":
            config["language"] = {"sourceLanguage": source_lang}
            config["audioFormat"] = audio_format
            config["samplingRate"] = sampling_rate
            if self.asr_service_id:
                config["serviceId"] = self.asr_service_id

        elif task_type == "tts":
            config["language"] = {"sourceLanguage": source_lang}
            config["gender"] = gender
            if self.tts_service_id:
                config["serviceId"] = self.tts_service_id

        elif task_type == "ocr":
            config["language"] = {"sourceLanguage": source_lang}
            if self.ocr_service_id:
                config["serviceId"] = self.ocr_service_id

        return config

    def validate_configuration(self) -> Tuple[bool, str]:
        """Validate if Bhashini configuration is complete and valid."""
        if not self.are_credentials_present():
            return False, "CREDENTIALS_MISSING"
        if not self.base_url or not self.base_url.startswith("http"):
            return False, "CONFIG_INVALID"
        return True, "CONFIG_VALID"

    async def test_reachability(self) -> Tuple[bool, str]:
        """Test low-level network reachability of Bhashini API host."""
        is_valid, reason = self.validate_configuration()
        if not is_valid:
            return False, reason

        try:
            async with httpx.AsyncClient(timeout=4.0) as client:
                # Ping base URL or dhruva root
                res = await client.get("https://dhruva-api.bhashini.gov.in/", timeout=3.0)
                if res.status_code < 500:
                    return True, "REACHABLE"
                return False, f"SERVICE_UNAVAILABLE (HTTP {res.status_code})"
        except httpx.ConnectError:
            return False, "API_UNREACHABLE"
        except httpx.TimeoutException:
            return False, "API_TIMEOUT"
        except Exception as e:
            return False, f"API_ERROR: {type(e).__name__}"

    async def test_asr_service(self) -> Tuple[str, Optional[str]]:
        """Independently probe Bhashini ASR."""
        if not self.are_credentials_present():
            return "CREDENTIALS_MISSING", "Credentials missing"

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "asr",
                    "config": self.build_task_config("asr", "hi")
                }
            ],
            "inputData": {
                "audio": [{"audioContent": TINY_WAV_BASE64}]
            }
        }

        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(self.base_url, headers=self.get_auth_headers(), json=payload)
                if res.status_code == 200:
                    data = res.json()
                    outputs = data.get("pipelineResponse", [{}])[0].get("output", [])
                    if outputs:
                        return "READY", "ASR probe accepted and responded successfully"
                    return "SERVICE_TEST_FAILED", "Empty output structure in 200 OK response"
                elif res.status_code in [401, 403]:
                    return "API_REJECTED", f"Authentication failed (HTTP {res.status_code})"
                elif res.status_code in [400, 404, 422]:
                    return "CONFIG_INVALID", f"API rejected request structure (HTTP {res.status_code})"
                else:
                    return "SERVICE_UNAVAILABLE", f"HTTP {res.status_code}"
        except httpx.ConnectError:
            return "API_UNREACHABLE", "Connection refused / host unreachable"
        except httpx.TimeoutException:
            return "SERVICE_UNAVAILABLE", "Request timed out"
        except Exception as e:
            return "SERVICE_TEST_FAILED", f"Error: {type(e).__name__}"

    async def test_translation_service(self) -> Tuple[str, Optional[str]]:
        """Independently probe Bhashini NMT Text Translation."""
        if not self.are_credentials_present():
            return "CREDENTIALS_MISSING", "Credentials missing"

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "translation",
                    "config": {
                        "language": {
                            "sourceLanguage": "en",
                            "targetLanguage": "hi"
                        }
                    }
                }
            ],
            "inputData": {
                "input": [{"source": "Hello"}]
            }
        }
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(self.base_url, headers=self.get_auth_headers(), json=payload)
                if res.status_code == 200:
                    data = res.json()
                    outputs = data.get("pipelineResponse", [{}])[0].get("output", [])
                    if outputs and outputs[0].get("target"):
                        target_text = outputs[0].get("target", "")
                        # Verification that target is present and non-empty
                        if target_text.strip():
                            return "READY", f"NMT translation verified"
                        return "SERVICE_TEST_FAILED", "Empty target translation string"
                    return "SERVICE_TEST_FAILED", "Missing target field in pipelineResponse"
                elif res.status_code in [401, 403]:
                    return "API_REJECTED", f"Authentication failed (HTTP {res.status_code})"
                elif res.status_code in [400, 404, 422]:
                    return "CONFIG_INVALID", f"API rejected request structure (HTTP {res.status_code})"
                else:
                    return "SERVICE_UNAVAILABLE", f"HTTP {res.status_code}"
        except httpx.ConnectError:
            return "API_UNREACHABLE", "Connection refused / host unreachable"
        except httpx.TimeoutException:
            return "SERVICE_UNAVAILABLE", "Request timed out"
        except Exception as e:
            return "SERVICE_TEST_FAILED", f"Error: {type(e).__name__}"

    async def test_tts_service(self) -> Tuple[str, Optional[str]]:
        """Independently probe Bhashini TTS Text-to-Speech."""
        if not self.are_credentials_present():
            return "CREDENTIALS_MISSING", "Credentials missing"

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "tts",
                    "config": {
                        "language": {"sourceLanguage": "hi"},
                        "gender": "female"
                    }
                }
            ],
            "inputData": {
                "input": [{"source": "नमस्ते"}]
            }
        }
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(self.base_url, headers=self.get_auth_headers(), json=payload)
                if res.status_code == 200:
                    data = res.json()
                    audio_list = data.get("pipelineResponse", [{}])[0].get("audio", [])
                    if audio_list and audio_list[0].get("audioContent"):
                        audio_b64 = audio_list[0].get("audioContent", "")
                        if len(audio_b64.strip()) > 10:
                            return "READY", "TTS synthesized valid audio payload"
                        return "SERVICE_TEST_FAILED", "Audio content payload was empty"
                    return "SERVICE_TEST_FAILED", "Missing audioContent in response"
                elif res.status_code in [401, 403]:
                    return "API_REJECTED", f"Authentication failed (HTTP {res.status_code})"
                elif res.status_code in [400, 404, 422]:
                    return "CONFIG_INVALID", f"API rejected request structure (HTTP {res.status_code})"
                else:
                    return "SERVICE_UNAVAILABLE", f"HTTP {res.status_code}"
        except httpx.ConnectError:
            return "API_UNREACHABLE", "Connection refused / host unreachable"
        except httpx.TimeoutException:
            return "SERVICE_UNAVAILABLE", "Request timed out"
        except Exception as e:
            return "SERVICE_TEST_FAILED", f"Error: {type(e).__name__}"

    async def test_ocr_service(self) -> Tuple[str, Optional[str]]:
        """Independently probe Bhashini OCR Optical Character Recognition."""
        if not self.are_credentials_present():
            return "CREDENTIALS_MISSING", "Credentials missing"

        payload = {
            "pipelineTasks": [
                {
                    "taskType": "ocr",
                    "config": {
                        "language": {"sourceLanguage": "hi"}
                    }
                }
            ],
            "inputData": {
                "image": [{"imageContent": TINY_PNG_BASE64}]
            }
        }
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                res = await client.post(self.base_url, headers=self.get_auth_headers(), json=payload)
                if res.status_code == 200:
                    data = res.json()
                    pipeline_resp = data.get("pipelineResponse", [])
                    if pipeline_resp:
                        return "READY", "OCR probe accepted and structure validated"
                    return "SERVICE_TEST_FAILED", "Empty pipelineResponse in OCR result"
                elif res.status_code in [401, 403]:
                    return "API_REJECTED", f"Authentication failed (HTTP {res.status_code})"
                elif res.status_code in [400, 404, 422]:
                    return "CONFIG_INVALID", f"API rejected request structure (HTTP {res.status_code})"
                else:
                    return "SERVICE_UNAVAILABLE", f"HTTP {res.status_code}"
        except httpx.ConnectError:
            return "API_UNREACHABLE", "Connection refused / host unreachable"
        except httpx.TimeoutException:
            return "SERVICE_UNAVAILABLE", "Request timed out"
        except Exception as e:
            return "SERVICE_TEST_FAILED", f"Error: {type(e).__name__}"

    async def run_full_diagnostics(self, force_live: bool = False) -> Dict[str, Any]:
        """
        Execute or retrieve cached multi-service Bhashini health diagnostics.
        Independently tests each service and reports granular status without credential leakage.
        """
        now = time.time()
        if not force_live and self._last_diagnostics and (now - self._last_diagnostics_time < self._cache_ttl_seconds):
            return self._last_diagnostics

        is_config_valid, config_reason = self.validate_configuration()
        if not is_config_valid:
            diag_result = {
                "name": "BHASHINI Service",
                "status": "NOT_CONFIGURED" if config_reason == "CREDENTIALS_MISSING" else "ERROR",
                "details": f"{config_reason}: BHASHINI_INFERENCE_KEY or BHASHINI_UDYAT_KEY required in .env",
                "credentials": "MISSING",
                "configuration": config_reason,
                "api": "NOT_TESTED",
                "services": {
                    "asr": "NOT_CONFIGURED",
                    "translation": "NOT_CONFIGURED",
                    "tts": "NOT_CONFIGURED",
                    "ocr": "NOT_CONFIGURED"
                },
                "last_tested_at": datetime.now().isoformat()
            }
            self._last_diagnostics = diag_result
            self._last_diagnostics_time = now
            return diag_result

        # Test reachability
        reachable, reach_reason = await self.test_reachability()
        if not reachable:
            diag_result = {
                "name": "BHASHINI Service",
                "status": "DISCONNECTED",
                "details": f"Credentials: PRESENT | API: {reach_reason}",
                "credentials": "PRESENT",
                "configuration": "CONFIG_VALID",
                "api": reach_reason,
                "services": {
                    "asr": reach_reason,
                    "translation": reach_reason,
                    "tts": reach_reason,
                    "ocr": reach_reason
                },
                "last_tested_at": datetime.now().isoformat()
            }
            self._last_diagnostics = diag_result
            self._last_diagnostics_time = now
            return diag_result

        # Run independent service tests
        asr_status, asr_detail = await self.test_asr_service()
        nmt_status, nmt_detail = await self.test_translation_service()
        tts_status, tts_detail = await self.test_tts_service()
        ocr_status, ocr_detail = await self.test_ocr_service()

        all_ready = (asr_status == "READY" and nmt_status == "READY" and tts_status == "READY" and ocr_status == "READY")
        some_ready = any(s == "READY" for s in [asr_status, nmt_status, tts_status, ocr_status])

        if all_ready:
            overall_status = "CONNECTED"
            details_str = "Credentials: PRESENT | API: REACHABLE | ASR: READY | NMT: READY | TTS: READY | OCR: READY"
        elif some_ready:
            overall_status = "PARTIAL"
            details_str = f"Credentials: PRESENT | ASR: {asr_status} | NMT: {nmt_status} | TTS: {tts_status} | OCR: {ocr_status}"
        else:
            overall_status = "ERROR"
            details_str = f"Credentials: PRESENT | Services Failed: ASR ({asr_status}), NMT ({nmt_status}), TTS ({tts_status}), OCR ({ocr_status})"

        diag_result = {
            "name": "BHASHINI Service",
            "status": overall_status,
            "details": details_str,
            "credentials": "PRESENT",
            "configuration": "CONFIG_VALID",
            "api": "REACHABLE",
            "services": {
                "asr": asr_status,
                "translation": nmt_status,
                "tts": tts_status,
                "ocr": ocr_status
            },
            "last_tested_at": datetime.now().isoformat()
        }
        self._last_diagnostics = diag_result
        self._last_diagnostics_time = now
        return diag_result

bhashini_client = BhashiniClient()

