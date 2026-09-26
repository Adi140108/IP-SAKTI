# IP-SAKTI Sahayak (SIH Problem Statement: PS-26045)

**IP-SAKTI Sahayak** is a multilingual, source-cited, RAG-grounded AI assistant for Intellectual Property (IP) and Regulatory guidance related to Ayurveda, traditional knowledge, and biological resources across Indian and International legal regimes.

---

## 🌟 Key Features & Architecture

- **Dual High-Speed AI Engine**: Groq 120B Fast primary inference with automatic Ollama Gemma 4 12B local fallback for intent parsing, query planning, and dynamic clarification.
- **6-Tier Formulation Legal Classification**:
  1. *Classical / Generic Medicine* (First Schedule 54 texts • Section 3(p) TK bar • TKDL defense)
  2. *Patent & Proprietary (P&P) Medicine* (Section 3(h) D&C Act • Synergistic efficacy proof)
  3. *New / Non-Classical Ayurvedic Drug* (New Drugs Rules 2019 • CDSCO IND pathway)
  4. *Phytopharmaceutical Drug* (Rule 122E / Schedule Y • Standardized fraction with min 4 markers)
  5. *Ayurveda-Aahar / Nutraceutical Food* (FSSAI Regulations 2022 • FoSCoS licensing)
  6. *Ayurvedic Cosmetic / Personal Care* (Cosmetics Rules 2020 • Industrial Designs & Trademarks)
- **One-Click Ayurvedic IP Diagnostic Dossier**: Exports complete pre-filing legal dossiers with parameter matrices, Section 3(p)/3(e) analyses, NBA ABS duties, verified statutory citations, and printable PDF stylesheets.
- **Official Government Registry Catalog & Direct Portals**:
  - *Indian Patent Office (IPO / IP India)*: Form 1, Form 2, Form 18, Form 27 (2024 Triennial Rules).
  - *National Biodiversity Authority (NBA)*: Form I (Access for Research/Commercial), Form III (IPR Approval).
  - *FSSAI FoSCoS*: Ayurveda-Aahar food business licensing.
  - *Ministry of AYUSH / CDSCO*: SLA Form 25D, CDSCO Form 44 (Phytopharmaceutical IND).
  - *WIPO*: ePCT portal & WIPO GRATK Treaty (2024) genetic resource disclosures.
- **Authoritative RAG Engine & Statutory Citations**: BM25 + Vector hybrid retrieval strictly filtered by Jurisdiction (India vs International) with verifiable statute sections.
- **BHASHINI Multilingual Speech AI & Inline OCR**: Hands-free voice recognition, natural cadence female voice synthesis (0.85x speed), and document OCR ingestion.
- **Adaptive Light & Dark Theme UI**: Full design system supporting glassmorphism, responsive contrast, and custom IP-SAKTI branding.

---

## 📁 Repository Structure

```
IP-SAKTI/
├── backend/
│   ├── app/
│   │   ├── main.py                     # FastAPI application entrypoint
│   │   ├── config.py                   # Environment configuration
│   │   ├── schemas/                    # Pydantic schemas (case, chat, document)
│   │   ├── ai/
│   │   │   ├── groq/provider.py        # Groq 120B Fast Provider
│   │   │   ├── gemma/provider.py       # Ollama Gemma 4 12B Provider
│   │   │   └── bhashini/service.py     # BHASHINI ASR, NMT, TTS, OCR Service
│   │   ├── db/firestore.py             # Firestore Service Layer (with fallback)
│   │   ├── storage/backblaze.py        # Backblaze B2 Storage (with fallback)
│   │   ├── rag/
│   │   │   ├── vector_store.py         # Authoritative Legal Index & Search
│   │   │   └── retriever.py            # Jurisdiction & Domain metadata filters
│   │   ├── modules/                    # Logic modules (questioning, classification, ip_router)
│   │   └── api/v1/                     # API routers (chat, cases, sources, diagnostics)
│   ├── tests/                          # Pytest test suite
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── public/                         # Brand logos, icons, favicon.ico
│   ├── src/
│   │   ├── app/                        # Next.js pages (Overview, Chat, Case, Sources)
│   │   ├── components/                 # Modals (Dossier, OfficialForms, Pathway), Navbar, Footer
│   │   ├── lib/                        # api.ts, formulationTaxonomy.ts
│   │   └── types/                      # TypeScript definitions
│   └── package.json
└── README.md
```

---

## 🚀 Getting Started

### 1. Backend Setup (FastAPI)

```bash
cd backend
pip install -r requirements.txt
cp .env.example .env
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

### 2. Frontend Setup (Next.js)

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:3000` to access the application UI and `http://localhost:8000/docs` for the interactive API documentation.

### 3. Running Unit Tests

```bash
pytest backend/tests
```

---

## 🔐 Environment Configuration

Create a `.env` file in `backend/` with your credentials:

```ini
# Primary LLM: Groq API
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=llama-3.3-70b-versatile

# Fallback LLM: Ollama / Gemma 4 12B
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=gemma4:12b

# BHASHINI Multi-lingual API
BHASHINI_UDYAT_KEY=your_udyat_key_here
BHASHINI_INFERENCE_KEY=your_inference_key_here

# Firebase Firestore
FIREBASE_PROJECT_ID=ip-sakti-dev
FIREBASE_CREDENTIALS_PATH=./firebase_credentials.json

# Backblaze B2
B2_APPLICATION_KEY_ID=your_b2_key_id
B2_APPLICATION_KEY=your_b2_key
B2_BUCKET_NAME=ip-sakti-docs
```

---

## 📜 Legal Disclaimer

IP-SAKTI Sahayak provides informational guidance regarding Intellectual Property and Regulatory compliance under SIH Problem Statement PS-26045. It does not provide binding legal advice.
