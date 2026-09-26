import os
import shutil
import pytest
from app.rag.evidence import EvidenceChunk
from app.rag.source_registry import LegalSourceMetadata, source_registry
from app.rag.vector_store import VectorStoreInterface
from app.rag.embeddings import embeddings_provider

TEST_PERSIST_DIR = os.path.abspath("./tests/data/test_vector_index")

@pytest.fixture(autouse=True)
def cleanup_test_dir():
    """Clean up temporary test vector index directory before and after tests."""
    if os.path.exists(TEST_PERSIST_DIR):
        shutil.rmtree(TEST_PERSIST_DIR, ignore_errors=True)
    yield
    if os.path.exists(TEST_PERSIST_DIR):
        shutil.rmtree(TEST_PERSIST_DIR, ignore_errors=True)

def test_1_persistent_vector_store_initializes_successfully():
    """TEST 1: Persistent vector store initializes successfully."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    assert store.db_type == "persistent"
    assert os.path.exists(store._get_index_file_path())
    assert len(store.chunks) == 0

def test_2_chunk_can_be_embedded_and_indexed():
    """TEST 2: A chunk can be embedded and indexed."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    chunk = EvidenceChunk(
        chunk_id="CHK_TEST_1",
        source_id="SRC_TEST_1",
        document_id="DOC_TEST_1",
        checksum="abcd1234ef56",
        title="Test Patent Act",
        authority="Test Authority",
        jurisdiction="India",
        country="India",
        source_type="statute",
        authority_level="statutory",
        section="Section 3(p)",
        text="Traditional knowledge combinations are excluded from patentability.",
        relevance_score=0.0
    )
    added = store.add_chunks([chunk])
    assert added == 1
    assert len(store.chunks) == 1
    assert len(store.chunk_embeddings) == 1
    assert len(store.chunk_embeddings[0]) == 128

def test_3_indexed_chunk_can_be_retrieved():
    """TEST 3: Indexed chunk can be retrieved via search."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    chunk = EvidenceChunk(
        chunk_id="CHK_TEST_AYUR_1",
        source_id="SRC_TEST_AYUR",
        document_id="DOC_TEST_AYUR",
        checksum="hash_ayur_1",
        title="Ayurvedic Synergistic Efficacy Act",
        authority="Ministry of AYUSH",
        jurisdiction="India",
        country="India",
        source_type="statute",
        authority_level="statutory",
        section="Section 3(e)",
        text="Synergistic efficacy assay evidence must be provided for herbal extracts.",
        relevance_score=0.0
    )
    store.add_chunks([chunk])
    
    results = store.search_chunks(
        query="Synergistic efficacy assay evidence",
        jurisdiction="India",
        top_k=3
    )
    assert len(results) == 1
    assert results[0].chunk_id == "CHK_TEST_AYUR_1"
    assert "Synergistic" in results[0].text

def test_4_metadata_survives_vector_persistence():
    """TEST 4: Metadata survives vector persistence."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    chunk = EvidenceChunk(
        chunk_id="CHK_META_SURVIVE_1",
        source_id="SRC_META_1",
        document_id="DOC_META_1",
        checksum="sha256_meta_test",
        title="Full Metadata Statute",
        authority="Statutory Council",
        jurisdiction="India",
        country="India",
        region="India",
        applicable_countries=["India"],
        source_type="statute",
        authority_level="statutory",
        section="Section 10(4)",
        article="",
        effective_date="2026-01-01",
        version="Act 2026",
        retrieved_at="2026-09-24",
        source_url="https://ipindia.gov.in/act-2026",
        text="Biological material origin disclosure is mandatory.",
        relevance_score=0.0
    )
    store.add_chunks([chunk])
    
    # Reload from disk directly
    reloaded_store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    assert len(reloaded_store.chunks) == 1
    loaded_chunk = reloaded_store.chunks[0]
    
    assert loaded_chunk.chunk_id == "CHK_META_SURVIVE_1"
    assert loaded_chunk.document_id == "DOC_META_1"
    assert loaded_chunk.checksum == "sha256_meta_test"
    assert loaded_chunk.section == "Section 10(4)"
    assert loaded_chunk.source_url == "https://ipindia.gov.in/act-2026"

def test_5_country_metadata_survives_persistence():
    """TEST 5: Country metadata survives persistence."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    de_chunk = EvidenceChunk(
        chunk_id="CHK_DE_PERSIST_1",
        source_id="SRC_DE_PATG",
        document_id="DOC_DE_1",
        checksum="hash_de_1",
        title="German Patent Act (PatG)",
        authority="DPMA",
        jurisdiction="International",
        country="Germany",
        region="EU",
        applicable_countries=["Germany"],
        source_type="statute",
        authority_level="statutory",
        section="Section 1a PatG",
        text="Biological material isolated from natural environment may be patented.",
        relevance_score=0.0
    )
    store.add_chunks([de_chunk])
    
    reloaded_store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    loaded_de = reloaded_store.chunks[0]
    assert loaded_de.country == "Germany"
    assert loaded_de.region == "EU"
    assert loaded_de.applicable_countries == ["Germany"]

def test_6_same_document_checksum_does_not_create_duplicate_vectors():
    """TEST 6: Same document/checksum does not create duplicate vectors."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    chunk = EvidenceChunk(
        chunk_id="CHK_DUP_TEST",
        source_id="SRC_DUP_TEST",
        document_id="DOC_DUP_TEST",
        checksum="identical_checksum_123",
        title="Idempotency Test",
        authority="Authority",
        jurisdiction="India",
        country="India",
        source_type="statute",
        authority_level="statutory",
        section="Section 1",
        text="Idempotent indexing text payload.",
        relevance_score=0.0
    )
    added_1 = store.add_chunks([chunk])
    assert added_1 == 1
    assert len(store.chunks) == 1
    
    # Attempt to add exact same chunk with same checksum
    added_2 = store.add_chunks([chunk])
    assert added_2 == 0
    assert len(store.chunks) == 1

def test_7_changed_checksum_creates_new_indexed_version():
    """TEST 7: Changed checksum creates a new indexed version."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    v1_chunk = EvidenceChunk(
        chunk_id="CHK_VER_1",
        source_id="SRC_VER_TEST",
        document_id="DOC_VER_V1",
        checksum="checksum_v1",
        title="Version Test",
        authority="Authority",
        jurisdiction="India",
        country="India",
        source_type="statute",
        authority_level="statutory",
        section="Section 1",
        text="Version 1 text content.",
        relevance_score=0.0
    )
    store.add_chunks([v1_chunk])
    assert len(store.chunks) == 1
    
    v2_chunk = EvidenceChunk(
        chunk_id="CHK_VER_2",
        source_id="SRC_VER_TEST",
        document_id="DOC_VER_V2",
        checksum="checksum_v2_updated",
        title="Version Test",
        authority="Authority",
        jurisdiction="India",
        country="India",
        source_type="statute",
        authority_level="statutory",
        section="Section 1",
        text="Version 2 amended text content.",
        relevance_score=0.0
    )
    added_v2 = store.add_chunks([v2_chunk])
    assert added_v2 == 1
    assert len(store.chunks) == 2

def test_8_delete_by_document_id_removes_only_requested_document():
    """TEST 8: delete_by_document_id removes only the requested document."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    chunk_a = EvidenceChunk(
        chunk_id="CHK_DOC_A_1",
        source_id="SRC_A",
        document_id="DOC_A",
        checksum="hash_a",
        title="Doc A",
        authority="Auth",
        jurisdiction="India",
        country="India",
        text="Doc A content",
        relevance_score=0.0
    )
    chunk_b = EvidenceChunk(
        chunk_id="CHK_DOC_B_1",
        source_id="SRC_B",
        document_id="DOC_B",
        checksum="hash_b",
        title="Doc B",
        authority="Auth",
        jurisdiction="India",
        country="India",
        text="Doc B content",
        relevance_score=0.0
    )
    store.add_chunks([chunk_a, chunk_b])
    assert len(store.chunks) == 2
    
    deleted = store.delete_by_document_id("DOC_A")
    assert deleted == 1
    assert len(store.chunks) == 1
    assert store.chunks[0].document_id == "DOC_B"

def test_9_index_survives_store_reinitialization():
    """TEST 9: Index survives store/application reinitialization (persistence verification)."""
    # Phase 1: Initialize, ingest, persist
    store1 = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    chunk = EvidenceChunk(
        chunk_id="CHK_PERSIST_RESTART",
        source_id="SRC_RESTART",
        document_id="DOC_RESTART",
        checksum="restart_hash_999",
        title="Restart Survival Test",
        authority="Authority",
        jurisdiction="International",
        country="Germany",
        section="Section 1",
        text="This text must be retrievable after process restart.",
        relevance_score=0.0
    )
    store1.add_chunks([chunk])
    del store1  # Simulate process termination
    
    # Phase 2: Fresh instance pointing to same persist_path
    store2 = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    assert len(store2.chunks) == 1
    results = store2.search_chunks(
        query="retrievable after process restart",
        jurisdiction="International",
        country="Germany",
        top_k=2
    )
    assert len(results) == 1
    assert results[0].chunk_id == "CHK_PERSIST_RESTART"

def test_10_germany_retrieval_does_not_return_us_only_domestic_source():
    """TEST 10: Germany retrieval does not return a US-only domestic source as applicable authority."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    us_chunk = EvidenceChunk(
        chunk_id="CHK_US_1",
        source_id="SRC_US_PATENT_CODE_35USC",
        document_id="DOC_US",
        checksum="hash_us",
        title="US Patent Code 35 USC",
        authority="USPTO",
        jurisdiction="International",
        country="USA",
        source_type="statute",
        text="35 USC 101 subject matter eligibility natural extracts",
        relevance_score=0.0
    )
    de_chunk = EvidenceChunk(
        chunk_id="CHK_DE_1",
        source_id="SRC_DE_PATENT_ACT_PATG",
        document_id="DOC_DE",
        checksum="hash_de",
        title="German Patentgesetz PatG",
        authority="DPMA",
        jurisdiction="International",
        country="Germany",
        source_type="statute",
        text="Section 1a PatG subject matter eligibility natural biological material",
        relevance_score=0.0
    )
    store.add_chunks([us_chunk, de_chunk])
    
    results = store.search_chunks(
        query="subject matter eligibility natural extracts",
        jurisdiction="International",
        country="Germany",
        top_k=5
    )
    source_ids = [r.source_id for r in results]
    assert "SRC_DE_PATENT_ACT_PATG" in source_ids
    assert "SRC_US_PATENT_CODE_35USC" not in source_ids

def test_11_international_treaty_remains_retrievable_for_germany():
    """TEST 11: International treaty remains retrievable for Germany."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    treaty_chunk = EvidenceChunk(
        chunk_id="CHK_WIPO_1",
        source_id="SRC_INT_WIPO_PCT_1970",
        document_id="DOC_WIPO",
        checksum="hash_wipo",
        title="Patent Cooperation Treaty (PCT)",
        authority="WIPO",
        jurisdiction="International",
        country=None,
        region="International",
        source_type="treaty",
        article="Article 15",
        text="Article 15 PCT international prior art search on herbal medicine",
        relevance_score=0.0
    )
    store.add_chunks([treaty_chunk])
    
    results = store.search_chunks(
        query="PCT international prior art search",
        jurisdiction="International",
        country="Germany",
        top_k=3
    )
    assert len(results) == 1
    assert results[0].source_id == "SRC_INT_WIPO_PCT_1970"

def test_12_india_retrieval_remains_country_safe():
    """TEST 12: India retrieval remains country-safe and excludes foreign domestic statutes."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    in_chunk = EvidenceChunk(
        chunk_id="CHK_IN_1",
        source_id="SRC_IN_PATENTS_ACT_1970",
        document_id="DOC_IN",
        checksum="hash_in",
        title="The Patents Act 1970",
        authority="CGPDTM",
        jurisdiction="India",
        country="India",
        source_type="statute",
        section="Section 3(p)",
        text="Section 3(p) traditional knowledge is not an invention",
        relevance_score=0.0
    )
    foreign_chunk = EvidenceChunk(
        chunk_id="CHK_FOREIGN_1",
        source_id="SRC_FOREIGN_1",
        document_id="DOC_FOREIGN",
        checksum="hash_for",
        title="Foreign Domestic Statute",
        authority="Foreign Office",
        jurisdiction="International",
        country="Germany",
        source_type="statute",
        text="Section 3(p) traditional knowledge is evaluated differently abroad",
        relevance_score=0.0
    )
    store.add_chunks([in_chunk, foreign_chunk])
    
    results = store.search_chunks(
        query="Section 3(p) traditional knowledge",
        jurisdiction="India",
        top_k=3
    )
    source_ids = [r.source_id for r in results]
    assert "SRC_IN_PATENTS_ACT_1970" in source_ids
    assert "SRC_FOREIGN_1" not in source_ids

def test_13_empty_index_returns_no_evidence_instead_of_fabricated_evidence():
    """TEST 13: Empty index returns no evidence instead of fabricated evidence."""
    store = VectorStoreInterface(db_type="persistent", persist_path=TEST_PERSIST_DIR)
    # Ensure store is completely empty
    store.chunks.clear()
    store.chunk_embeddings.clear()
    store.indexed_chunk_keys.clear()
    
    results = store.search_chunks(
        query="Can I patent Ashwagandha extract?",
        jurisdiction="India",
        top_k=4
    )
    assert len(results) == 0

def test_14_persistent_mode_failure_produces_explicit_error():
    """TEST 14: Persistent mode failure produces an explicit error and does not silently fall back to memory."""
    # Attempt to initialize in an invalid path that cannot be created as a directory
    invalid_path = "Z:\\non_existent_drive_999\\forbidden\\vector_index"
    
    with pytest.raises(RuntimeError) as exc_info:
        VectorStoreInterface(db_type="persistent", persist_path=invalid_path)
    
    assert "PERSISTENT_VECTOR_INIT_FAILURE" in str(exc_info.value) or "error" in str(exc_info.value).lower()
