# Persistent Vector Indexing Architecture (STEP 4B)

## 1. Vector-Store Implementation Selected
The vector store is implemented in [`VectorStoreInterface`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/vector_store.py#L16-L325) supporting dual operation modes:
- **`memory`**: In-memory development mode loaded with authoritative baseline statutory corpora.
- **`persistent`**: Disk-backed persistent storage serializing chunks, metadata, and 128-dimensional dense embeddings to JSON (`VECTOR_DB_PERSIST_PATH`).

## 2. Why It Was Selected
- **Zero Heavy Native Dependencies**: Avoids C++ compile/wheel conflicts on Windows/Linux environments while retaining fast disk I/O and atomic file replacement (`.tmp` write + rename).
- **Deterministic & Local**: Functions completely offline without requiring paid third-party cloud vector subscriptions (Pinecone, Weaviate, etc.).
- **Hybrid Retrieval Synergy**: Seamlessly combines dense vector cosine similarity with BM25 lexical term overlap, title/section/article boosts, and deterministic jurisdiction/country filtering.

## 3. Embedding Implementation
- Implemented in [`EmbeddingsProvider`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/embeddings.py#L7-L49) in `backend/app/rag/embeddings.py`.
- Generates **128-dimensional dense normalized semantic feature vectors** using md5/sha256 word feature hashing, character 3-gram and 4-gram subword frequency projections, and L2 Euclidean normalization.
- **100% Deterministic**: Identical input text produces identical vectors under all conditions. No random weights or external API dependencies.

## 4. Persistence Location & Configuration
Configured in `backend/app/config.py` and `backend/.env.example`:
- `VECTOR_DB_TYPE`: `"memory"` or `"persistent"`.
- `VECTOR_DB_PERSIST_PATH`: Path to the index directory or JSON file (e.g. `./data/vector_index` / `./data/vector_index/vector_index.json`).
- If `VECTOR_DB_TYPE == "persistent"` and directory creation/access fails, the store raises an explicit `RuntimeError` (`PERSISTENT_VECTOR_INIT_FAILURE`) rather than silently falling back to memory mode.

## 5. Ingestion → Embedding → Indexing Flow
```
Downloaded Document Bytes
          ↓
SHA-256 Byte Checksum & Duplicate Check
          ↓
Section / Article Parser
          ↓
EvidenceChunk Generation (Attaches document_id & checksum)
          ↓
Dense Vector Embedding (embeddings_provider.generate_embedding)
          ↓
Idempotent Indexing (Indexed by chunk_id:checksum)
          ↓
Disk Persistence (Atomic write to VECTOR_DB_PERSIST_PATH)
```

## 6. Duplicate Handling
- Every chunk is indexed by a composite key `chunk_id:checksum`.
- Re-ingesting an identical document with the same SHA-256 checksum skips vector generation and adds 0 duplicate vectors to the store.

## 7. Version Handling
- If an amended document version is ingested with a new checksum, the new chunks are indexed with their updated `version` and `checksum` metadata.
- [`delete_by_document_id(document_id)`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/vector_store.py#L136-L157) and [`delete_by_source_id(source_id)`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/vector_store.py#L159-L180) allow clean deactivation/removal of superseded document chunks without touching unrelated sources.

## 8. Metadata Persistence
All statutory provenance metadata survives serialization and reload:
- `chunk_id`, `source_id`, `document_id`, `checksum`
- `title`, `authority`, `jurisdiction`, `country`, `region`, `applicable_countries`
- `source_type`, `authority_level`, `section`, `article`, `effective_date`, `version`, `retrieved_at`, `source_url`

## 9. Country-Aware Filtering
Persistent vector search continues to enforce [`is_source_applicable(...)`](file:///C:/Users/ADITHYA/Desktop/Projects/IP-SAKTI/backend/app/rag/vector_store.py#L182-L263) deterministically before ranking:
- For Germany (`country = "Germany"`): German PatG, EU EPC, and universal treaties (PCT, Nagoya) are eligible; US 35 U.S.C. and Indian domestic law are strictly excluded regardless of semantic similarity.
- For India: Indian domestic statutes and applicable international treaties are eligible; foreign domestic laws are excluded.
- For unassigned international queries: Universal international treaties are retrieved without fabricating a country.

## 10. Restart & Persistence Test
Verified in `backend/tests/test_persistent_vector_store.py`:
- `test_9_index_survives_store_reinitialization`: Instantiates store, indexes chunk, deletes store instance (simulating process restart), initializes a fresh instance from disk, and verifies exact chunk retrieval.

## 11. Configuration Required
In `.env`:
```env
VECTOR_DB_TYPE=persistent
VECTOR_DB_PERSIST_PATH=./data/vector_index
```

## 12. Implementation Status & Limitations

| Component | Status | Details |
| :--- | :--- | :--- |
| **Local Persistent Vector Store** | **REAL** | Fully implemented, disk-backed, tested with restart persistence |
| **Deterministic Dense Embeddings** | **REAL** | 128-dimensional L2-normalized subword/term feature embeddings |
| **Idempotent Vector Ingestion** | **REAL** | Checksum-based duplicate avoidance verified |
| **Country-Aware Deterministic Filtering** | **REAL** | Domestic vs Regional vs International treaty filters active |
| **Restart Persistence** | **REAL** | Reload from disk verified with 14 dedicated unit tests |
| **Distributed / Cloud Vector DB** | **NOT IMPLEMENTED** | Cloud-scale clustering (Milvus, Qdrant, Pinecone) intentionally out of scope for local deployment |
| **Automated Source Crawling** | **NOT IMPLEMENTED** | Web crawling intentionally restricted to explicit approved download endpoints |
