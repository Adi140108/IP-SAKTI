# IP-SAKTI Codebase Rebuild Audit & Refactoring Roadmap

This document provides an exhaustive, component-by-component audit of the existing codebase, identifying functional components, hardcoded/mocked fallbacks, security vulnerabilities, and architectural changes required for PS-26045 compliance.

---

## 1. Security & Configuration Audit

| File / Component | Status | Findings / Vulnerabilities | Action Required |
| :--- | :--- | :--- | :--- |
| `backend/firebase_credentials.json` | ❌ UNSAFE | Raw GCP Service Account private key committed to project root. | **Remove file from git tracking**, add to `.gitignore`, load via environment variables only. |
| `backend/.env` | ❌ UNSAFE | Live BHASHINI and Backblaze B2 application keys committed. | **Remove secret values**, create `backend/.env.example` with blank placeholders. |
| `backend/app/config.py` | ⚠️ INCOMPLETE | Lacks explicit `APP_ENV`, `DATABASE_MODE`, `STORAGE_MODE`, and `RAG_MODE` controls. | Add explicit environment & mode flags (`development` vs `production`). |

---

## 2. Backend Subsystems Audit

### 2.1 RAG Architecture & Legal Sources (`backend/app/rag/vector_store.py`, `retriever.py`)
- **Current Implementation**: `VectorStore` initializes 8 hardcoded dictionary objects (`IN_PATENT_SEC_3P`, `IN_BD_ACT_SEC_6`, etc.) directly in `load_seed_knowledge()`.
- **Functionality**: Mocked BM25 search over 8 static hardcoded text blocks.
- **Flaws**: Fake RAG implementation. No real document ingestion pipeline, no source registry, no real embeddings, no vector DB abstraction, no chunk metadata tracking.
- **Action Required**: **REPLACE**. Implement real RAG pipeline with `source_registry.py`, `ingestion.py`, `embeddings.py`, `query_planner.py`, `retriever.py`, `reranker.py`, `vector_store.py` (interface supporting Memory/Chroma/Qdrant), and `evidence.py`.

---

### 2.2 Case State & Structured Extraction (`backend/app/schemas/case.py`, `backend/app/api/v1/cases.py`)
- **Current Implementation**: Pydantic `CaseState` schema exists, but `chat.py` only appends raw user query strings into `known_information` list (`known_information.append(f"User Query: {user_text}")`).
- **Flaws**: No structured extraction layer using Gemma to continuously extract ingredients, formulation category, TK involvement, biological resource origin, and target IP objectives into cumulative state.
- **Action Required**: **REPLACE & EXPAND**. Create `backend/app/case/models.py`, `extractor.py`, `state_manager.py` for structured cumulative state extraction.

---

### 2.3 Dynamic Questioning Engine (`backend/app/modules/questioning/engine.py`)
- **Current Implementation**: Uses Gemma prompt or falls back to a hardcoded `fallback_map` dictionary of fixed question strings.
- **Flaws**: Behaves like a semi-static form. Does not evaluate cumulative state history or prevent repeating answered questions.
- **Action Required**: **REPLACE**. Implement true dynamic question generator driven by missing information in cumulative `CaseState`, asking ONE question at a time in accessible language (with Ayurvedic technical terms in brackets).

---

### 2.4 Formulation Classifier (`backend/app/modules/classification/engine.py`)
- **Current Implementation**: Classifies product strictly from the *latest user prompt text*.
- **Flaws**: Ignores cumulative `CaseState` history (ingredients, classical text reference, process, intended use).
- **Action Required**: **REPLACE**. Implement cumulative `CaseState`-based classifier producing reasoning factors, missing information list, and confidence.

---

### 2.5 Multi-Domain IP Router (`backend/app/modules/ip_router/engine.py`)
- **Current Implementation**: Uses simple keyword check fallback (`if "patent" in lower_text ...`) when Gemma call fails.
- **Flaws**: Keyword fallback introduces false positives and ignores case evidence.
- **Action Required**: **REPLACE**. Implement evidence and CaseState aware multi-domain routing.

---

### 2.6 Citation Validator (`backend/app/modules/citations/validator.py`)
- **Current Implementation**: Accepts citations and sets `is_authoritative = True` even if the citation is loosely matched or fallback generated.
- **Flaws**: Unsafe. Permits unverified legal claims to be marked authoritative.
- **Action Required**: **REPLACE**. Enforce strict semantic claim-to-evidence verification. If a claim is unsupported by retrieved statutory evidence, reject the citation or trigger Safe Abstention.

---

### 2.7 BHASHINI Integration (`backend/app/ai/bhashini/service.py`)
- **Current Implementation**: Contains hardcoded pipeline ID (`64392f08d207f47410886364`) and returns dummy mock strings like `"[Translated (hi)]: ..."` in dev mode. Diagnostics reports `CONNECTED` based merely on non-empty key strings.
- **Flaws**: Guessed service configuration. Misleading status reporting.
- **Action Required**: **REPLACE**. Refactor into modular provider adapters (`client.py`, `asr.py`, `translation.py`, `tts.py`, `ocr.py`). Perform actual API health checks for status reporting (`CREDENTIALS_PRESENT`, `CONFIG_VALID`, `API_REACHABLE`, `ASR_TESTED`, etc.).

---

### 2.8 Dual OCR Pipeline & Gemma Vision (`backend/app/modules/ocr/service.py`)
- **Current Implementation**: Converts input document file to base64 string directly without PDF multi-page rendering or PDF page-by-page extraction.
- **Flaws**: Fails on multi-page PDF files.
- **Action Required**: **REPLACE**. Multi-page PDF rendering -> page-by-page OCR -> Gemma Vision fallback per page with page-level metadata.

---

### 2.9 Storage & Database Layer (`backend/app/db/firestore.py`, `storage/backblaze.py`)
- **Current Implementation**: Silently fall back to local disk JSON / folder storage when cloud credentials fail or are omitted.
- **Flaws**: Silent fallbacks mask production environment failures.
- **Action Required**: **REPLACE**. Enforce explicit mode flags (`APP_ENV=production` vs `development`). Production mode must fail clearly if Firestore or Backblaze B2 is unreachable.

---

## 3. Frontend UI Audit (`frontend/src/app/*`)

- **Current Implementation**: Single chat column with top tab navigation.
- **Flaws**: Generic developer dashboard layout. Does not implement the real multi-pane IP-Sakti workspace layout.
- **Action Required**: **REBUILD**. Implement the multi-pane product UI:
  - **Top Bar**: IP-Sakti logo, Jurisdiction (India / International dropdown + Country selector), Language selector, Voice button, Case selector.
  - **Left Panel**: CaseState summary & Information Status tracker (Known, Uncertain, Missing).
  - **Center Panel**: Conversational Assistant with Dynamic Question Card, Voice Input, Text Input.
  - **Right Panel**: Evidence & Citation Cards, Confidence Badge & Breakdown.
  - **Bottom Bar**: Document OCR, Source Explorer, Human Escalation.
  - **Voice UI**: Audio recording state, transcription preview, confirm, submit, read answer aloud via Bhashini TTS.

---

## 4. Subsystem Retainability Summary

| Component | Retain / Replace | Strategy |
| :--- | :--- | :--- |
| FastAPI Setup (`app/main.py`) | **RETAIN & REFACTOR** | Keep router structure and CORS middleware; add clean error handlers. |
| Next.js App Router Structure | **RETAIN & REBUILD UI** | Keep Next.js 14 TypeScript layout; rebuild UI components into multi-pane workspace. |
| Pydantic Schema Concepts | **RETAIN & EXPAND** | Expand `CaseState` schema to include detailed extraction fields. |
| Ollama Provider Concept | **RETAIN & REFACTOR** | Refactor into `LLMProvider` interface (`generate`, `generate_structured`, `supports_vision`). |
