# IP-SAKTI Authoritative Legal RAG Corpus & Ingestion Status

## 1. Overview & Architecture Transition
Prior to this upgrade, the application embedded a statutory baseline in Python code (`load_registered_statutory_chunks()`) for development convenience. 

This update completely separates the **Development Seed Corpus** (`DEV_SEED_CORPUS`) from the **Production Authoritative Corpus** (`OFFICIAL_PRODUCTION_CORPUS`):
- **Development Mode (`APP_ENV=development`)**: In-memory mode loads the baseline seed corpus for rapid prototyping and unit testing without network dependencies.
- **Production Mode (`APP_ENV=production`)**: Strictly requires persistent vector storage (`VECTOR_DB_TYPE=persistent` and `VECTOR_DB_PERSIST_PATH=...`). Loading the hardcoded dev seed corpus in production is blocked and will raise a `FORBIDDEN_DEV_SEED_IN_PRODUCTION` error. If the persistent index is missing or contains 0 chunks, it explicitly flags `PRODUCTION_RAG_CORPUS_EMPTY` rather than silently falling back to mock data.

---

## 2. Official Source Registry & Security Trust Boundary
The official source registry ([backend/app/rag/source_registry.py](file:///c:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/source_registry.py)) serves as the cryptographic and domain trust boundary.

### Security Guarantees:
1. **Domain Allowlist Validation**: Only approved government, inter-governmental, and statutory repositories can be queried (`ipindia.gov.in`, `indiacode.nic.in`, `nbaindia.org`, `wipo.int`, `cbd.int`, `epo.org`, `dpma.de`, etc.).
2. **Canonical Registered Endpoints**: Only URLs explicitly registered in `OfficialSourceDefinition` are crawled. Arbitrary user-provided or search engine URLs are rejected.
3. **HTTPS & Size Limits**: Strict HTTPS enforcement, 15-second request timeouts, and 25 MB payload limits protect against oversized downloads and denial of service.
4. **Cryptographic SHA-256 Byte Hashing**: Checksums are computed strictly from raw downloaded bytes to detect real content changes.

---

## 3. Multi-Format Ingestion & Legal-Aware Chunking Pipeline
The ingestion engine ([backend/app/rag/ingestion.py](file:///c:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/ingestion.py)) processes multiple source formats:
- **HTML Sources**: Strips non-content markup (`<script>`, `<style>`, `<nav>`, `<footer>`) using BeautifulSoup and extracts statutory headings (`<h1>`-`<h6>`, `<p>`).
- **PDF Documents**: Page-by-page text extraction via `pypdf` / `pymupdf` while preserving page numbers (`page_number`). If a PDF is scanned without a text layer, it is flagged with `OCR_REQUIRED` rather than fabricating synthetic text.
- **Plain Text / Markdown**: Parses structural paragraphs and statutory provisions.
- **Legal Hierarchical Syntax Recognition**: Chunking follows legal grammar (Act → Chapter → Section → Subsection → Rule → Article → Schedule), ensuring individual legal provisions (e.g., Section 3(p), Section 3(e), Article 15, Rule 18) remain coherent units.

---

## 4. Checksum Versioning & Immutability
- **Idempotency & Duplicate Prevention**: Ingesting an identical document (matching SHA-256) returns status `UNCHANGED` without re-embedding or duplicating chunks.
- **Immutable Version History**: When an authoritative source is updated with new content, a new immutable version tag (`vX.0_YYYYMMDD`) is generated, preserving older versions in the version history.
- **Failure Resilience**: A failed network request or parse error never deletes or overwrites the active valid corpus.

---

## 5. Controlled CLI Update Tool
The update workflow is operated through a dedicated CLI tool ([backend/app/rag/update_corpus.py](file:///c:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/update_corpus.py)):

```bash
# Dry-run audit (inspects checksums without mutating active index)
python -m app.rag.update_corpus --dry-run

# Update a single registered official source
python -m app.rag.update_corpus --source-id SRC_IN_PATENTS_ACT_1970

# Ingest and update all registered official sources
python -m app.rag.update_corpus --all
```

---

## 6. Corpus Inspection & Observability
The Vector Store provides inspection metadata via `vector_store.get_corpus_inspection_summary()`, exposed through the Diagnostics endpoint (`/api/v1/system/diagnostics`) and Sources catalog (`/api/v1/sources`):
- `corpus_mode`: `OFFICIAL_PRODUCTION_CORPUS` | `DEV_SEED_CORPUS` | `PRODUCTION_RAG_CORPUS_EMPTY`
- `total_chunks`, `total_documents`, `source_ids`, `source_titles`
- `jurisdictions`, `countries`, `versions`, `checksums`, `retrieved_at`

---

## 7. Known Limitations & Ongoing Roadmap
1. **Scanned PDF Monograph Fallbacks**: Scanned PDF gazettes without embedded text layers require asynchronous OCR processing via the offline OCR pipeline when enabled.
2. **Third-Party CDN Rate Limits**: Direct government portal crawls should respect the concurrency limit (`concurrency=3`, `request_delay_seconds=0.2`) to prevent firewall blocking.
