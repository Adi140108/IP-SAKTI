import pytest
import httpx
from unittest.mock import AsyncMock, patch, MagicMock
from app.config import settings
from app.ai.bhashini.client import bhashini_client, TINY_WAV_BASE64, TINY_PNG_BASE64
from app.ai.bhashini.asr import bhashini_asr
from app.ai.bhashini.translation import bhashini_translation
from app.ai.bhashini.tts import bhashini_tts
from app.ai.bhashini.ocr import bhashini_ocr
from app.ai.bhashini.service import bhashini_service
from app.modules.ocr.service import ocr_pipeline
from app.ai.gemma.provider import gemma_provider

@pytest.mark.asyncio
async def test_1_missing_credentials_reported():
    """TEST 1: Missing credentials -> CREDENTIALS_MISSING in diagnostics."""
    with patch.object(settings, "BHASHINI_INFERENCE_KEY", None), \
         patch.object(settings, "BHASHINI_UDYAT_KEY", None), \
         patch.object(settings, "BHASHINI_API_KEY", None):
        
        diag = await bhashini_client.run_full_diagnostics(force_live=True)
        assert diag["status"] == "NOT_CONFIGURED"
        assert diag["credentials"] == "MISSING"
        assert "CREDENTIALS_MISSING" in diag["details"]
        assert diag["services"]["asr"] == "NOT_CONFIGURED"
        assert diag["services"]["translation"] == "NOT_CONFIGURED"

@pytest.mark.asyncio
async def test_2_credentials_present_missing_required_config():
    """TEST 2: Credentials present but missing required configuration -> CONFIG_INVALID / CONFIG_MISSING."""
    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_inf_key"), \
         patch.object(settings, "BHASHINI_BASE_URL", ""):
        
        is_valid, reason = bhashini_client.validate_configuration()
        assert is_valid is False
        assert reason == "CONFIG_INVALID"

@pytest.mark.asyncio
async def test_3_invalid_configuration():
    """TEST 3: Invalid configuration URL format."""
    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_inf_key"), \
         patch.object(settings, "BHASHINI_BASE_URL", "ftp://invalid-url-endpoint"):
        
        is_valid, reason = bhashini_client.validate_configuration()
        assert is_valid is False
        assert reason == "CONFIG_INVALID"

@pytest.mark.asyncio
async def test_4_api_unreachable():
    """TEST 4: API unreachable -> API_UNREACHABLE status across services."""
    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_inf_key"), \
         patch.object(settings, "BHASHINI_BASE_URL", "https://dhruva-api.bhashini.gov.in/services/inference"), \
         patch("httpx.AsyncClient.get", side_effect=httpx.ConnectError("Network unreachable")):
        
        diag = await bhashini_client.run_full_diagnostics(force_live=True)
        assert diag["status"] == "DISCONNECTED"
        assert diag["api"] == "API_UNREACHABLE"
        assert diag["services"]["asr"] == "API_UNREACHABLE"
        assert diag["services"]["translation"] == "API_UNREACHABLE"

@pytest.mark.asyncio
async def test_5_asr_successful_response():
    """TEST 5: ASR successful response -> ASR tested/ready."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "pipelineResponse": [
            {
                "output": [{"source": "Ayurvedic herbal patent application"}]
            }
        ]
    }

    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_key"), \
         patch.object(settings, "VOICE_PROVIDER", "bhashini"), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        
        status, detail = await bhashini_client.test_asr_service()
        assert status == "READY"
        
        transcript = await bhashini_asr.speech_to_text(TINY_WAV_BASE64, "hi")
        assert transcript == "Ayurvedic herbal patent application"

@pytest.mark.asyncio
async def test_6_asr_api_failure():
    """TEST 6: ASR API failure -> ASR failure, not READY."""
    mock_resp = MagicMock()
    mock_resp.status_code = 401
    mock_resp.text = "Unauthorized inference key"

    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "invalid_key"), \
         patch.object(settings, "VOICE_PROVIDER", "bhashini"), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        
        status, detail = await bhashini_client.test_asr_service()
        assert status == "API_REJECTED"
        assert status != "READY"
        
        transcript = await bhashini_asr.speech_to_text(TINY_WAV_BASE64, "hi")
        assert transcript is None

@pytest.mark.asyncio
async def test_7_translation_successful_response():
    """TEST 7: Translation successful response -> translation tested/ready."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "pipelineResponse": [
            {
                "output": [{"target": "नमस्ते आयुर्वेदिक अन्वेषक"}]
            }
        ]
    }

    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_key"), \
         patch.object(settings, "VOICE_PROVIDER", "bhashini"), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        
        status, detail = await bhashini_client.test_translation_service()
        assert status == "READY"
        
        translated = await bhashini_translation.translate("Hello Ayurvedic Innovator", "en", "hi")
        assert translated == "नमस्ते आयुर्वेदिक अन्वेषक"

@pytest.mark.asyncio
async def test_8_translation_failure_no_silent_fallback():
    """TEST 8: Translation failure -> explicit error, NOT original text masquerading as success."""
    mock_resp = MagicMock()
    mock_resp.status_code = 500

    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_key"), \
         patch.object(settings, "VOICE_PROVIDER", "bhashini"), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        
        status, detail = await bhashini_client.test_translation_service()
        assert status == "SERVICE_UNAVAILABLE"
        
        # In production mode with bhashini, failure must raise an exception or fail explicitly
        with pytest.raises(RuntimeError) as exc_info:
            await bhashini_translation.translate("Patents Act Section 3(p)", "en", "hi")
        assert "Bhashini translation" in str(exc_info.value)

@pytest.mark.asyncio
async def test_9_tts_successful_response_with_audio():
    """TEST 9: TTS successful response with audio -> TTS tested/ready."""
    valid_audio_b64 = "UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQAAAAA="
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "pipelineResponse": [
            {
                "audio": [{"audioContent": valid_audio_b64}]
            }
        ]
    }

    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_key"), \
         patch.object(settings, "VOICE_PROVIDER", "bhashini"), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        
        status, detail = await bhashini_client.test_tts_service()
        assert status == "READY"
        
        audio = await bhashini_tts.text_to_speech("Namaste", "hi")
        assert audio == valid_audio_b64

@pytest.mark.asyncio
async def test_10_tts_empty_audio_response():
    """TEST 10: TTS empty/invalid audio response -> failure."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "pipelineResponse": [
            {
                "audio": [{"audioContent": ""}]
            }
        ]
    }

    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_key"), \
         patch.object(settings, "VOICE_PROVIDER", "bhashini"), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        
        status, detail = await bhashini_client.test_tts_service()
        assert status == "SERVICE_TEST_FAILED"
        
        audio = await bhashini_tts.text_to_speech("Namaste", "hi")
        assert audio is None

@pytest.mark.asyncio
async def test_11_ocr_successful_response():
    """TEST 11: OCR successful response -> OCR tested/ready."""
    mock_resp = MagicMock()
    mock_resp.status_code = 200
    mock_resp.json.return_value = {
        "pipelineResponse": [
            {
                "output": [{"source": "Ayurvedic Pharmacopoeia Monograph Content"}]
            }
        ]
    }

    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_key"), \
         patch.object(settings, "VOICE_PROVIDER", "bhashini"), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        
        status, detail = await bhashini_client.test_ocr_service()
        assert status == "READY"
        
        ocr_text = await bhashini_ocr.perform_ocr(TINY_PNG_BASE64, "hi")
        assert ocr_text == "Ayurvedic Pharmacopoeia Monograph Content"

@pytest.mark.asyncio
async def test_12_ocr_failure():
    """TEST 12: OCR failure -> failure."""
    mock_resp = MagicMock()
    mock_resp.status_code = 503

    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_key"), \
         patch.object(settings, "VOICE_PROVIDER", "bhashini"), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_resp):
        
        status, detail = await bhashini_client.test_ocr_service()
        assert status == "SERVICE_UNAVAILABLE"
        
        ocr_text = await bhashini_ocr.perform_ocr(TINY_PNG_BASE64, "hi")
        assert ocr_text is None

@pytest.mark.asyncio
async def test_13_credentials_present_but_service_tests_fail():
    """TEST 13: Credentials present but service tests fail -> overall Bhashini must NOT report all services READY."""
    mock_get = MagicMock()
    mock_get.status_code = 200
    
    mock_post = MagicMock()
    mock_post.status_code = 500  # All services return 500

    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_key"), \
         patch("httpx.AsyncClient.get", new_callable=AsyncMock, return_value=mock_get), \
         patch("httpx.AsyncClient.post", new_callable=AsyncMock, return_value=mock_post):
        
        diag = await bhashini_client.run_full_diagnostics(force_live=True)
        assert diag["status"] == "ERROR"
        assert diag["services"]["asr"] != "READY"
        assert diag["services"]["translation"] != "READY"
        assert diag["services"]["tts"] != "READY"
        assert diag["services"]["ocr"] != "READY"

@pytest.mark.asyncio
async def test_14_no_pipeline_id_config_clean_omission():
    """TEST 14: When pipeline ID is not set, no fake pipeline ID is added."""
    with patch.object(settings, "BHASHINI_INFERENCE_KEY", "dummy_key"), \
         patch.object(settings, "BHASHINI_PIPELINE_ID", None):
        
        headers = bhashini_client.get_auth_headers()
        assert "pipelineId" not in headers
        assert headers["Authorization"] == "dummy_key"

@pytest.mark.asyncio
async def test_15_production_mode_bhashini_failure_no_silent_mock():
    """TEST 15: Production mode + Bhashini failure -> no mock/browser silent fallback."""
    with patch.object(settings, "VOICE_PROVIDER", "bhashini"), \
         patch.object(settings, "BHASHINI_INFERENCE_KEY", None):
        
        asr_res = await bhashini_asr.speech_to_text(TINY_WAV_BASE64, "hi")
        assert asr_res is None  # Does not produce fake mock text in bhashini mode

@pytest.mark.asyncio
async def test_16_pdf_rendering_failure_explicit_error():
    """TEST 16: PDF rendering failure -> explicit OCR failure, not raw PDF passed as image."""
    corrupt_pdf_bytes = b"NOT_A_VALID_PDF_HEADER_DATA"
    
    ocr_res = await ocr_pipeline.process_document_ocr(
        file_id="doc_corrupt_1",
        filename="corrupt_spec.pdf",
        file_bytes=corrupt_pdf_bytes,
        language="hi"
    )
    
    assert ocr_res.status == "failed"
    assert "PDF_RENDERING_FAILED" in (ocr_res.error or "")
    assert ocr_res.page_count == 0

@pytest.mark.asyncio
async def test_17_gemma_vision_fallback_used_only_for_ocr():
    """TEST 17: Gemma Vision fallback is used only for OCR/vision."""
    # When Bhashini OCR returns None, and Gemma supports vision, Gemma Vision is invoked
    valid_png_bytes = b"\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR\x00\x00\x00\x01\x00\x00\x00\x01\x08\x06\x00\x00\x00\x1f\x15c4"
    
    with patch.object(bhashini_service, "perform_ocr", new_callable=AsyncMock, return_value=None), \
         patch.object(gemma_provider, "supports_vision", new_callable=AsyncMock, return_value=True), \
         patch.object(gemma_provider, "extract_vision_text", new_callable=AsyncMock, return_value="Extracted text via Gemma Vision Fallback"):
        
        ocr_res = await ocr_pipeline.process_document_ocr(
            file_id="doc_vision_1",
            filename="ayurvedic_scan.png",
            file_bytes=valid_png_bytes,
            language="hi"
        )
        
        assert ocr_res.ocr_engine == "gemma_vision"
        assert "Gemma Vision" in ocr_res.extracted_text

@pytest.mark.asyncio
async def test_18_normal_legal_reasoning_never_calls_gemma_as_bhashini_fallback():
    """TEST 18: Normal legal reasoning never calls Gemma as a Bhashini failure fallback."""
    from app.orchestration.conversation_pipeline import conversation_pipeline
    from app.schemas.chat import ChatRequest
    
    # Send a request with voice audio that fails ASR
    with patch.object(bhashini_service, "speech_to_text", new_callable=AsyncMock, return_value=None), \
         patch.object(gemma_provider, "generate_structured_json", new_callable=AsyncMock) as mock_gemma_gen:
        
        req = ChatRequest(
            case_id="case_bhashini_test",
            message="",
            language="hi",
            audio_base64=TINY_WAV_BASE64
        )
        
        resp = await conversation_pipeline.execute_conversation_turn(req)
        assert resp.safe_abstention is True
        assert "Voice Recognition Notice" in resp.answer
        # Verify Gemma provider was NOT called to generate legal reasoning
        mock_gemma_gen.assert_not_called()
