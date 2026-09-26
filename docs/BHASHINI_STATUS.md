# IP-SAKTI BHASHINI Integration & Multi-Service Diagnostics Architecture

> **Core Principle**: *Bhashini services (ASR, NMT, TTS, OCR) are treated as discrete production services. Credentials presence does not equal service readiness. Failures are handled explicitly without silent pseudo-success fallbacks.*

---

## 1. Role of BHASHINI in IP-SAKTI

BHASHINI (National Language Translation Mission / Udyat Dhruva API) provides sovereign, AI-driven Indian multilingual and multimodal capabilities to IP-SAKTI:
* **Speech-to-Text (ASR)**: Transcribes grassroots innovator voice queries in Indian languages (Hindi, Tamil, Telugu, Marathi, Bengali, Kannada, etc.).
* **Machine Translation (NMT)**: Translates local language queries to English for Groq statutory reasoning and translates executive IP guidance back to the user's native language.
* **Text-to-Speech (TTS)**: Synthesizes natural audio guidance for accessibility and voice-assisted exploration.
* **Optical Character Recognition (OCR)**: Extracts Devanagari and regional language text from scanned Ayurvedic formulations, classical texts, and patent documents.

---

## 2. Multi-Service Adapter Architecture

```text
User Interaction (Voice / Text / Scanned Document)
                       │
       ┌───────────────┼───────────────┬────────────────┐
       ▼               ▼               ▼                ▼
   ASR Adapter    NMT Adapter     TTS Adapter      OCR Adapter
   (speech_to_text) (translate)   (text_to_speech) (perform_ocr)
       │               │               │                │
       └───────────────┴───────┬───────┴────────────────┘
                               ▼
                    Bhashini Dhruva Client
             (Independent Diagnostic Probes & Auth)
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
   Real Bhashini API                     Configured Fallback
(VOICE_PROVIDER=bhashini)                (OCR -> Gemma Vision)
```

---

## 3. Independent Service Diagnostics & Status Breakdown

The [`BhashiniClient`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/ai/bhashini/client.py) separates base host reachability from discrete functional probes for each sub-service.

### Diagnostic States
* `READY`: Service probe succeeded and returned a valid, non-empty response payload.
* `NOT_CONFIGURED`: Missing required credentials (`BHASHINI_INFERENCE_KEY` or `BHASHINI_UDYAT_KEY`).
* `CONFIG_INVALID`: Configuration URL or parameters are malformed.
* `API_UNREACHABLE`: Network connection failure or host unreachable.
* `API_REJECTED`: Authentication failure (HTTP 401/403) or bad request (HTTP 400/422).
* `SERVICE_UNAVAILABLE`: Bhashini endpoint error (HTTP 500/502/503/504).
* `SERVICE_TEST_FAILED`: Response returned HTTP 200 but payload was empty or malformed.

### Diagnostics Response Structure
```json
{
  "name": "BHASHINI Service",
  "status": "CONNECTED",
  "details": "Credentials: PRESENT | API: REACHABLE | ASR: READY | NMT: READY | TTS: READY | OCR: READY",
  "credentials": "PRESENT",
  "configuration": "CONFIG_VALID",
  "api": "REACHABLE",
  "services": {
    "asr": "READY",
    "translation": "READY",
    "tts": "READY",
    "ocr": "READY"
  },
  "last_tested_at": "2026-09-26T22:15:00.000000"
}
```

---

## 4. Required Environment Variables

Configure the following variables in `.env` or Render environment settings:

| Variable | Required | Description | Example (Redacted) |
|---|---|---|---|
| `VOICE_PROVIDER` | Optional | Operational mode (`bhashini` or `mock`) | `bhashini` |
| `BHASHINI_INFERENCE_KEY` | Required* | Primary Dhruva inference authorization key | `YOUR_INFERENCE_KEY` |
| `BHASHINI_UDYAT_KEY` | Optional* | Udyat pipeline access key | `YOUR_UDYAT_KEY` |
| `BHASHINI_BASE_URL` | Optional | Inference base URL | `https://dhruva-api.bhashini.gov.in/services/inference` |
| `BHASHINI_PIPELINE_ID` | Optional | Explicit pipeline ID (if specific pipeline required) | None |
| `BHASHINI_USER_ID` | Optional | Optional user ID header | None |

*\*At least one of `BHASHINI_INFERENCE_KEY` or `BHASHINI_UDYAT_KEY` must be configured for live Bhashini operations.*

---

## 5. Explicit Failure Policy & No Silent Fallbacks

* **ASR Failure**: Returns `None` and triggers an explicit voice transcription notice in [`ConversationPipeline`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/orchestration/conversation_pipeline.py). It does **not** send empty text into legal reasoning or rely on browser speech recognition in the backend.
* **Translation Failure**: Raises a `RuntimeError` or logs explicit error. It does **not** silently return English text claiming it was translated to Hindi/Tamil.
* **TTS Failure**: Returns `None` and logs error. Does **not** produce fake audio.
* **OCR & PDF Failure**:
  * **PDF OCR**: PDFs must be rendered to valid page images (via PyMuPDF). If PDF rendering fails, an explicit `PDF_RENDERING_FAILED` error is recorded; raw PDF bytes are **never** forwarded to image OCR.
  * **Gemma Vision Fallback**: Only used for OCR/vision tasks when Bhashini OCR is unconfigured/unavailable. Gemma is **never** used for ordinary legal reasoning.

---

## 6. Test Suite & Verification Matrix

The test suite in [`backend/tests/test_bhashini.py`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/tests/test_bhashini.py) verifies all 18 Bhashini operational and diagnostic scenarios:

| Test Case | Scenario | Expected Result | Result |
|---|---|---|---|
| `test_1` | Missing credentials | `CREDENTIALS_MISSING` in diagnostics | **PASSED** |
| `test_2` | Missing URL configuration | `CONFIG_INVALID` | **PASSED** |
| `test_3` | Invalid URL format | `CONFIG_INVALID` | **PASSED** |
| `test_4` | API unreachable / network error | `API_UNREACHABLE` | **PASSED** |
| `test_5` | ASR successful response | `READY` & returns valid transcript | **PASSED** |
| `test_6` | ASR authentication/API failure | `API_REJECTED` & returns None | **PASSED** |
| `test_7` | Translation successful response | `READY` & returns translated target | **PASSED** |
| `test_8` | Translation failure | Explicit `RuntimeError`, no masquerade | **PASSED** |
| `test_9` | TTS successful response with audio | `READY` & returns base64 audio | **PASSED** |
| `test_10` | TTS empty audio payload | `SERVICE_TEST_FAILED` | **PASSED** |
| `test_11` | OCR successful response | `READY` & returns extracted text | **PASSED** |
| `test_12` | OCR 503 service failure | `SERVICE_UNAVAILABLE` & returns None | **PASSED** |
| `test_13` | Credentials present but services fail | Overall status reports `ERROR` (not READY) | **PASSED** |
| `test_14` | Missing pipeline ID | Clean header omission without guessing | **PASSED** |
| `test_15` | Production failure | No silent mock fallback | **PASSED** |
| `test_16` | Corrupt PDF rendering | `PDF_RENDERING_FAILED` explicit failure | **PASSED** |
| `test_17` | Gemma Vision fallback | Invoked strictly for OCR | **PASSED** |
| `test_18` | Legal reasoning separation | Groq used for law; Gemma never called for legal reasoning | **PASSED** |

**Total Backend Test Count**: **95 / 95 passing tests**.
