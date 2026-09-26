# Authoritative Source Ingestion Foundation (STEP 4A)

## 1. Source Registry Structure
The source registry is built around the [`LegalSourceMetadata`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/source_registry.py#L8-L27) model in `backend/app/rag/source_registry.py`:
- `source_id`: Canonical statutory identifier (e.g. `SRC_IN_PATENTS_ACT_1970`, `SRC_DE_PATENT_ACT_PATG`).
- `title`: Official full title of the statute or treaty.
- `authority`: Enacting/governing statutory body (e.g. CGPDTM, NBA, CDSCO, DPMA, EPO, WIPO, CBD).
- `jurisdiction`: `"India"` or `"International"`.
- `country`: Target sovereign country (`"India"`, `"Germany"`, `"USA"`, or `None` for multilateral treaties).
- `region`: Regional regime (`"India"`, `"EU"`, `"North America"`, `"International"`, `"Global"`).
- `applicable_countries`: Array of bound member states (e.g. EPC contracting states for Germany, France, etc.).
- `source_type`: `"statute"`, `"treaty"`, `"regulation"`, `"pharmacopoeia"`, `"tkdl_public"`.
- `document_type`: `"act"`, `"rules"`, `"guidelines"`, `"monograph"`.
- `effective_date`: Official gazette or enforcement date.
- `version`: Official legislative edition or amendment version.
- `retrieved_at`: Date of retrieval.
- `source_url`: Authoritative source repository URL.
- `checksum`: SHA-256 cryptographic digest calculated directly from raw document bytes.
- `authority_level`: Statutory hierarchy (`"statutory"`, `"regulatory_guideline"`, `"public_pointer"`).
- `language`: Primary language (`"en"`, `"de"`, `"hi"`).
- `amendment_status`: Detailed amendment notes and section relevance.
- `status`: Lifecycle status (`"active"`, `"deprecated"`).

## 2. Source Document Lifecycle
The document lifecycle operates as follows:
```
Official Source (HTTPS from Authoritative Allowlist)
           ↓
Document Downloader (Secure fetch, size limit, timeout)
           ↓
Actual Document Bytes
           ↓
Cryptographic SHA-256 Calculation (Raw Bytes)
           ↓
Duplicate & Version Check (Registry Lookup by Checksum)
           ↓
Document Parser (Section/Article extraction; fail on corrupt/empty)
           ↓
Provenance Chunking (Attach source_id, document_id, checksum, country metadata)
           ↓
SourceDocument Registration (source_registry.register_document)
           ↓
EvidenceChunks Available for RAG
```

## 3. Checksum Mechanism
- The cryptographic checksum is computed strictly on **actual document bytes** using `hashlib.sha256(raw_bytes).hexdigest()`.
- Checksums are never derived from filenames, URLs, source titles, or metadata strings.
- Any change to a single byte in the document produces a completely different 64-character hex digest.

## 4. Version Handling
- When a document is re-ingested from an official URL, its raw byte SHA-256 checksum is compared with historical versions.
- If the checksum matches an existing entry, it is recognized as the same document content without re-chunking.
- If the checksum differs, it is identified as a new document revision/version, updating `retrieved_at` and `checksum` while registering a new [`SourceDocument`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/source_registry.py#L29-L43) entity.

## 5. Duplicate Detection
`SourceRegistry.get_document_by_checksum(checksum)` and `get_by_checksum(checksum)` maintain a global lookup table of ingested byte hashes. If Document A and Document B have identical contents but different download URLs, the system detects the duplicate and prevents redundant chunk duplication.

## 6. Authority Allowlist
To ensure legal reliability, downloads are restricted strictly to official government and international treaty portals:
- **India**: `ipindia.gov.in`, `indiacode.nic.in`, `nbaindia.org`, `cdsco.gov.in`, `fssai.gov.in`, `tkdl.res.in`, `ayush.gov.in`, `main.sci.gov.in`, `delhihighcourt.nic.in`.
- **International / Foreign**: `wipo.int`, `cbd.int`, `epo.org`, `uspto.gov`, `dpma.de`, `gesetze-im-internet.de`, `eur-lex.europa.eu`, `wto.org`, `who.int`.
- Commercial websites, blogs, Wikipedia, and arbitrary web domains are strictly rejected by [`is_authority_allowed`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/source_registry.py#L88-L98).

## 7. Parsing Behavior
- Supported formats: Plain text (`text/plain`), Markdown (`text/markdown`), HTML (`text/html`), and structured JSON legal sections.
- Extracts distinct statutory provisions (`Section ...`, `Article ...`, `Rule ...`, `Monograph ...`).
- If a document is empty (0 bytes), whitespace-only, or unparseable, [`SourceIngestionPipeline`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/ingestion.py#L18-L230) returns `success=False` with explicit errors (`EMPTY_OR_CORRUPT_BYTES`, `UNPARSEABLE_DOCUMENT`) and never produces fake chunks.

## 8. Chunk Provenance
Every generated [`EvidenceChunk`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/evidence.py#L4-L25) retains full provenance:
- `chunk_id`
- `source_id`
- `document_id`
- `checksum` (SHA-256 of raw document bytes)
- `title`, `authority`, `jurisdiction`, `country`, `region`, `applicable_countries`, `source_type`, `authority_level`
- `section`, `article`, `effective_date`, `version`, `retrieved_at`, `source_url`

## 9. Storage Behavior
Raw source documents can be persisted to Backblaze B2 via `backblaze_service.upload_file` (in `STORAGE_MODE = "backblaze"`), or saved to local development storage (in `STORAGE_MODE = "mock"`). Remote storage failures in production raise explicit, non-swallowed exceptions.

## 10. Test Results
Comprehensive test suite in `backend/tests/test_source_ingestion.py`:
- `test_1_sha256_calculated_from_actual_bytes`: Verified.
- `test_2_changing_one_byte_changes_checksum`: Verified.
- `test_3_same_document_bytes_produce_same_checksum`: Verified.
- `test_4_different_document_bytes_produce_different_checksum`: Verified.
- `test_5_source_metadata_preserved_after_ingestion`: Verified.
- `test_6_country_metadata_survives_ingestion`: Verified.
- `test_7_version_and_checksum_survive_ingestion`: Verified.
- `test_8_download_http_failure_produces_explicit_ingestion_failure`: Verified.
- `test_9_unsupported_or_corrupt_document_does_not_produce_fake_chunks`: Verified.
- `test_10_duplicate_content_detected_using_checksum`: Verified.
- `test_11_country_aware_metadata_remains_intact`: Verified.

**All 48 backend tests passed cleanly with 0 failures.**

## 11. What is Intentionally NOT Implemented Yet
> [!IMPORTANT]
> Automated official-source crawling and persistent vector indexing are NOT part of STEP 4A.
- Persistent vector indexing, disk-backed vector storage (e.g. ChromaDB / FAISS / pgvector), and incremental index update lifecycle are scheduled for **STEP 4B**.
