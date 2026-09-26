# IP-SAKTI Sahayak — Frontend Integration & Architecture Status

**SIH Problem Statement PS-26045: AYUSH & Bio-Resource IP AI**  
**Date:** September 2026  
**Status:** `READY`

---

## 1. Frontend Architecture & Technology Stack

* **Framework:** Next.js 16.3.6 (App Router + Turbopack)
* **Core Library:** React 19.2.8 & TypeScript 5
* **Styling:** Vanilla TailwindCSS v4 with dark/light themes and glassmorphism styling
* **State & Persistence:** LocalStorage session persistence synchronized with FastAPI / Firestore backend
* **Speech AI:** Dual-engine speech system:
  * Voice synthesis: Browser SpeechSynthesis (0.85x speed, natural female voice profile) + backend BHASHINI TTS integration
  * Voice input: Web SpeechRecognition + backend BHASHINI ASR integration
* **Document Processing:** Inline document upload with client-side 25 MB guard and backend Backblaze B2 / OCR ingestion

---

## 2. Screen & Flow Inventory

| Route | View Name | Primary Function |
| :--- | :--- | :--- |
| `/` | Landing / Overview | Problem Statement context (PS-26045), hero CTA, core capabilities overview. |
| `/chat` | AI Consultation Chat | Three-pane consultation interface: Parameter tracker (left), Conversational guidance with dynamic question box & 1-click option chips (center), Evidence & citation verification with confidence score (right). |
| `/case` | Case State Workspace | Inspection of persisted parameters, 6-tier Ayurvedic formulation classification, consultation history transcript, and pre-filing diagnostic dossier generation. |
| `/sources` | Legal RAG Sources | Authoritative statutory browser for India Law (Patents Act 1970, Biological Diversity Act 2002/2023, TKDL Guidelines) and International Treaties (EPC, German PatG, WIPO, Nagoya Protocol). |
| `/diagnostics` | System Diagnostics | Live matrix displaying connection status of FastAPI Gateway, Groq LLM, Firestore, Backblaze B2, Bhashini, and Statutory Vector DB. |
| Modal | `FormulationPathwayModal` | 6-Tier Ayurvedic formulation taxonomy roadmap (Classical, Proprietary, New/Non-Classical, Phytopharmaceutical, Ayurveda Aahar, Cosmetic). |
| Modal | `OfficialFormsModal` | Directory of statutory IPO, NBA (Form I/III), and SLA/FoSCoS licensing forms. |
| Modal | `DossierExportModal` | Diagnostic pre-filing dossier exporter (Markdown & printable view). |

---

## 3. Backend Endpoints & API Integration

All frontend network requests are consolidated in [`src/lib/api.ts`](file:///c:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/frontend/src/lib/api.ts) with strict response validation, error extraction, and no secret leakage:

| Frontend Client Method | HTTP Request | Backend Gateway Route | Description |
| :--- | :--- | :--- | :--- |
| `fetchHealth()` | `GET` | `/api/v1/health` | Gateway health check used by Navbar status indicator |
| `fetchDiagnostics()` | `GET` | `/api/v1/system/diagnostics` | Matrix diagnostic status of all backend subsystems |
| `createCase(data)` | `POST` | `/api/v1/cases` | Initial case session creation with jurisdiction & language |
| `getCase(caseId)` | `GET` | `/api/v1/cases/{caseId}` | Fetches active CaseState parameters from Firestore/LocalDB |
| `updateCase(caseId, data)` | `PUT` | `/api/v1/cases/{caseId}` | Updates formulation classification or case parameters |
| `sendChatMessage(params)` | `POST` | `/api/v1/chat/message` | RAG query with country awareness, dynamic questioning, and citations |
| `uploadDocument(file, caseId)`| `POST` | `/api/v1/documents/upload` | Multipart file upload (25 MB max) for Backblaze B2 & OCR |
| `fetchLegalSources(jur)` | `GET` | `/api/v1/sources?jurisdiction=...`| Ingested statutory acts & sections |
| `fetchEscalationDossier(...)` | `POST` | `/api/v1/escalation/dossier` | Generates official pre-filing escalation dossier |

---

## 4. IP-SAKTI Core Flow & Dynamic Questioning

1. **Intake & Regime Selection:**
   * User selects **India** or **International** regime.
   * In **International** mode, country input (e.g. Germany, USA, Japan) is captured and preserved across the session.
2. **Dynamic Questioning & Adaptive Clarification:**
   * The backend returns exactly one context-aware target question in `next_question`.
   * The UI highlights the question prominently with clickable 1-click option chips (`suggested_options`).
   * Clicking a chip or submitting a custom reply immediately advances case parameter gathering.
3. **Statutory Citations & Verification:**
   * Citations explicitly display authoritative status (`✓ Authoritative` vs `Reference`) and evidence support status (`SUPPORTED` vs `UNSUPPORTED`).
   * Unsupported claims or missing evidence trigger visible Safe Abstention warnings.
4. **Human Review Escalation:**
   * Whenever `requires_human_escalation: true` is returned, an actionable banner appears offering 1-click export of the pre-filing dossier.

---

## 5. Build, Lint & Typecheck Results

* **TypeScript Compilation (`npx tsc --noEmit`):** `PASSED` (0 errors, strict type safety).
* **ESLint Validation (`npm run lint`):** `PASSED` (0 errors, 0 warnings).
* **Next.js Production Build (`npm run build`):** `PASSED` (11/11 static pages generated in ~3.1s).
