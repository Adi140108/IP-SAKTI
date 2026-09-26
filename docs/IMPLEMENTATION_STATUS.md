# IP-SAKTI — Implementation Status Matrix (PS-26045)

This document tracks the verified implementation, configuration presence, and test status of all system components.

---

## Component Status Matrix

| Component | Subsystem | Implementation | Configuration | Test Status | Details |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Groq Primary LLM** | `ai/groq/provider.py` | REAL | PRESENT | PASSED | Model: `qwen/qwen3.8-27b` / `openai/gpt-oss-120b` via Groq API. Handles reasoning, classification, and question generation. |
| **Gemma Local LLM** | `ai/gemma/provider.py` | REAL | OPTIONAL | PASSED | Fallback engine via Ollama. Inherits from `LLMProvider`. |
| **CaseState Engine** | `case/state_manager.py` | REAL | PRESENT | PASSED | Cumulative state tracking, parameter checklists, contradiction tracking. |
| **Structured Extraction** | `case/extractor.py` | REAL | PRESENT | PASSED | Validated structured JSON extraction of ingredients, classical basis, and TK/ABS flags. |
| **Dynamic Questioning** | `modules/questioning/` | REAL | PRESENT | PASSED | Evaluates information gaps and generates ONE high-value clarification question with 1-click option chips. |
| **6-Tier Classification** | `modules/classification/` | REAL | PRESENT | PASSED | 6 legal tiers: Classical, P&P, New Drug, Phytopharmaceutical, Ayurveda-Aahar, Cosmetic + Unknown. |
| **IP Router** | `modules/ip_router/` | REAL | PRESENT | PASSED | Evidence-backed routing across Patent, TM, GI, ABS, TKDL, Design, and Regulatory. |
| **Jurisdiction Engine** | `modules/jurisdiction/` | REAL | PRESENT | PASSED | Distinct routing between India Law and International Treaties / foreign countries without conflation. |
| **Source Registry** | `rag/source_registry.py` | REAL | PRESENT | PASSED | Tracks statutes, checksums, authority levels, effective dates, and official URLs. |
| **Source Ingestion & Chunking** | `rag/ingestion.py` | REAL | PRESENT | PASSED | Legal-aware statutory chunking preserving section titles, numbers, and references. |
| **Embeddings & Vector Store** | `rag/vector_store.py` | REAL | PRESENT | PASSED | Hybrid BM25 keyword + semantic retrieval with strict metadata filtering. |
| **Evidence Context** | `rag/evidence.py` | REAL | PRESENT | PASSED | Structured evidence payloads delivered to LLM with full source metadata. |
| **Claim Extraction** | `modules/citations/` | REAL | PRESENT | PASSED | Extracts material legal propositions from generated response before validation. |
| **Citation Validator** | `modules/citations/` | REAL | PRESENT | PASSED | Strict verification of claims against retrieved statutory evidence chunks. |
| **Evidence Confidence** | `modules/confidence/` | REAL | PRESENT | PASSED | Mathematical scoring (High, Medium, Limited) based on statutory evidence coverage. |
| **Safe Abstention** | `orchestration/` | REAL | PRESENT | PASSED | Automatically abstains and flags out-of-scope or unverified queries. |
| **BHASHINI Service** | `ai/bhashini/` | REAL | PRESENT | PASSED | Modular ASR, NMT translation, TTS, and OCR clients with diagnostic endpoint. |
| **Voice Consultation** | `frontend/src/app/chat` | REAL | PRESENT | PASSED | Speech-to-text input, natural cadence female TTS playback (0.85x speed). |
| **Document OCR Pipeline**| `modules/ocr/service.py` | REAL | PRESENT | PASSED | PDF page rendering, OCR extraction, and automatic CaseState ingestion. |
| **Firestore Repository** | `db/firestore.py` | REAL | DUAL (mock/prod) | PASSED | Explicit mode enforcement (`DATABASE_MODE=firestore`). |
| **Backblaze B2 Storage** | `storage/backblaze.py` | REAL | DUAL (mock/prod) | PASSED | S3-compatible cloud storage with explicit error propagation. |
| **Diagnostic Dossier Export** | `components/DossierExportModal` | REAL | PRESENT | PASSED | One-click Markdown download, copy, and print-optimized PDF generation. |
| **Official Forms Catalog** | `components/OfficialFormsModal` | REAL | PRESENT | PASSED | Direct access and portal links for IPO (Forms 1, 2, 18, 27), NBA, FSSAI, and AYUSH. |
| **UI & Theme Design System** | `frontend/src/` | REAL | PRESENT | PASSED | Responsive light/dark theme, parameter tracker, brand logo, and favicon. |
