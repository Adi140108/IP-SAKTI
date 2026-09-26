# IP-SAKTI — Comprehensive Rebuild & Architecture Audit

**Project:** IP-SAKTI Sahayak (SIH Problem Statement PS-26045)  
**Date:** September 2026  
**Auditor:** Antigravity AI Engineering Suite  

---

## 1. Executive Summary

This audit inspects the current repository state against the technical specification for PS-26045. It catalogs working modules, mocks, operational modes, security hygiene, and missing contracts across the entire stack.

---

## 2. Module Inspection & Status Matrix

| Subsystem / Module | Path | Implementation Type | Operational Modes Supported | Production Status & Findings |
| :--- | :--- | :--- | :--- | :--- |
| **Configuration** | `backend/app/config.py` | Real | `APP_ENV`, `DATABASE_MODE`, `STORAGE_MODE`, `RAG_MODE` | Explicit operational modes defined. Sensitive keys loaded strictly from `.env`. |
| **Primary LLM** | `backend/app/ai/groq/provider.py` | Real | Groq API (`qwen/qwen3.8-27b` / `llama-3.3-70b-versatile`) | Primary reasoning, structured CaseState extraction, dynamic question generation. |
| **Fallback LLM** | `backend/app/ai/gemma/provider.py` | Real / Local | Ollama (`gemma4:12b`) | Used strictly as fallback/vision provider if configured; not primary. |
| **Language AI** | `backend/app/ai/bhashini/` | Real API Client | `BHASHINI_UDYAT_KEY`, `BHASHINI_INFERENCE_KEY` | Modularized ASR, NMT, TTS, and OCR clients with diagnostics. |
| **Database** | `backend/app/db/firestore.py` | Dual | `mock` (Local JSON) vs `firestore` (Cloud) | Explicitly checks `DATABASE_MODE`. Raises error in production if Firestore is unreachable. |
| **Document Storage** | `backend/app/storage/backblaze.py` | Dual | `mock` (Local FS) vs `backblaze` (B2 S3) | Explicitly checks `STORAGE_MODE`. Raises error in production if B2 fails. |
| **RAG & Source Registry**| `backend/app/rag/` | Real / Hybrid | `mock` vs `production` | Tracks statutes, checksums, legal chunking, hybrid retrieval (BM25 + embeddings). |
| **CaseState & Extractor**| `backend/app/case/` | Real | Structured Pydantic | Cumulative state tracking, contradiction detection, missing info analysis. |
| **Dynamic Questioning** | `backend/app/modules/questioning/` | Real | Groq Reasoning | Evaluates gaps and asks ONE focused question to advance classification/IP. |
| **Formulation Classification**| `backend/app/modules/classification/` | Real | 6 Tiers + UNKNOWN | Strict 6-tier taxonomy matching D&C Act, FSSAI 2022, and Patent Act. Does not force unknown into classical. |
| **IP Router** | `backend/app/modules/ip_router/` | Real | Evidence-backed | Evaluates patent, TM, GI, ABS, TK, designs, and regulatory routes. |
| **Claim & Citation Validation**| `backend/app/modules/citations/` | Real | Strict Evidence Grounding | Matches generated claims against retrieved evidence chunks; rejects unverified claims. |
| **Evidence Confidence** | `backend/app/modules/confidence/` | Real | Mathematical Scoring | Computes evidence relevance, authority, and section match; triggers safe abstention when low. |
| **Frontend UI Workspace**| `frontend/src/app/` | Real | Next.js 16 + Tailwind | Light/Dark theme, Parameter Tracker, 6-Tier Pathway Modal, Official Forms Modal, Dossier Export. |

---

## 3. Security Hygiene & Credential Exposure Audit

- **Repository Cleanliness**:
  - `backend/.env` is strictly gitignored (`.gitignore` verified).
  - `backend/.env.example` contains variable names only with no raw secrets.
  - No `.pem`, `.key`, or service account JSON files committed to Git.
- **Revocation Notice**:
  > **SECURITY NOTICE**: Any credentials (Firebase, Backblaze, BHASHINI, Groq) previously tested in local development environments must be revoked and rotated before production staging.

---

## 4. Key Architectural Guarantees

1. **Groq Primary**: Groq API serves as the sole primary LLM engine. Gemma/Ollama is strictly an optional fallback/vision provider.
2. **Explicit Failure Policy**: In `production` mode, if Firestore or Backblaze or Groq fails, the system returns an explicit failure status without silent mock fallback.
3. **Evidence-First Legal Truth**: Legal guidance is strictly grounded in retrieved statutory evidence. If evidence is lacking, Safe Abstention is triggered.
4. **Strict Jurisdictional Separation**: India Law vs International Treaties are kept distinct with dedicated filters.
