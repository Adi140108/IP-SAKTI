import pytest
import hashlib
from app.rag.source_registry import (
    source_registry,
    LegalSourceMetadata,
    SourceDocument,
    is_authority_allowed
)
from app.rag.ingestion import ingestion_pipeline
from app.rag.downloader import document_downloader
from app.rag.evidence import EvidenceChunk

def test_1_sha256_calculated_from_actual_bytes():
    """TEST 1: SHA-256 is calculated strictly from actual document bytes."""
    test_bytes = b"Section 3(p): An invention which in effect is traditional knowledge is not patentable."
    expected_hash = hashlib.sha256(test_bytes).hexdigest()
    
    calculated_hash = ingestion_pipeline.compute_checksum(test_bytes)
    assert calculated_hash == expected_hash
    assert len(calculated_hash) == 64

def test_2_changing_one_byte_changes_checksum():
    """TEST 2: Changing one byte changes the checksum."""
    bytes_a = b"Section 3(e): A substance obtained by a mere admixture."
    bytes_b = b"Section 3(e): A substance obtained by a mere admixture!"  # one byte modified
    
    hash_a = ingestion_pipeline.compute_checksum(bytes_a)
    hash_b = ingestion_pipeline.compute_checksum(bytes_b)
    
    assert hash_a != hash_b

def test_3_same_document_bytes_produce_same_checksum():
    """TEST 3: Same document bytes produce the exact same checksum."""
    doc_bytes = b"Article 15 PCT: International search on traditional knowledge prior art."
    
    hash_1 = ingestion_pipeline.compute_checksum(doc_bytes)
    hash_2 = ingestion_pipeline.compute_checksum(doc_bytes)
    
    assert hash_1 == hash_2

def test_4_different_document_bytes_produce_different_checksum():
    """TEST 4: Different document bytes produce different checksums."""
    german_patg = b"Section 1a PatG: Discoveries of natural biological substances are excluded."
    us_patent_act = b"35 USC 101: Products of nature are patent ineligible subject matter."
    
    hash_de = ingestion_pipeline.compute_checksum(german_patg)
    hash_us = ingestion_pipeline.compute_checksum(us_patent_act)
    
    assert hash_de != hash_us

def test_5_source_metadata_preserved_after_ingestion():
    """TEST 5: Source metadata is preserved after ingestion into chunks."""
    source = LegalSourceMetadata(
        source_id="SRC_TEST_STATUTE_1",
        title="Test Ayurvedic IP Regulation 2026",
        authority="Ministry of AYUSH / IP India",
        jurisdiction="India",
        country="India",
        region="India",
        applicable_countries=["India"],
        source_type="statute",
        effective_date="2026-01-01",
        version="2026 Edition",
        source_url="https://ipindia.gov.in/test-act.htm",
        checksum="temp_placeholder",
        authority_level="statutory"
    )
    
    raw_doc = b"Section 101: Novel Ayurvedic Formulations.\nEvery formulation requires evidence of non-obviousness."
    res = ingestion_pipeline.ingest_document_bytes(source, raw_doc)
    
    assert res.success is True
    assert res.chunks_generated > 0
    
    chunks = ingestion_pipeline.process_and_chunk_source(
        source,
        [{"section": "Section 101", "content": "Every formulation requires evidence of non-obviousness."}],
        document_id=res.document_id,
        checksum=res.checksum
    )
    
    chunk = chunks[0]
    assert chunk.source_id == "SRC_TEST_STATUTE_1"
    assert chunk.title == "Test Ayurvedic IP Regulation 2026"
    assert chunk.authority == "Ministry of AYUSH / IP India"
    assert chunk.jurisdiction == "India"
    assert chunk.source_type == "statute"
    assert chunk.authority_level == "statutory"
    assert chunk.document_id == res.document_id
    assert chunk.checksum == res.checksum

def test_6_country_metadata_survives_ingestion():
    """TEST 6: Country and regional metadata survive ingestion for international sources."""
    de_source = LegalSourceMetadata(
        source_id="SRC_TEST_DE_PATG",
        title="German Patent Act Test Ingestion",
        authority="DPMA / Federal Ministry of Justice",
        jurisdiction="International",
        country="Germany",
        region="EU",
        applicable_countries=["Germany"],
        source_type="statute",
        effective_date="2024-01-01",
        version="PatG 2024",
        source_url="https://www.gesetze-im-internet.de/patg/",
        checksum="temp_checksum",
        authority_level="statutory"
    )
    
    raw_bytes = b"Section 1a PatG: Biological material isolation requires technical process."
    res = ingestion_pipeline.ingest_document_bytes(de_source, raw_bytes)
    
    assert res.success is True
    doc = source_registry.get_document(res.document_id)
    assert doc is not None
    
    updated_source = source_registry.get_source(de_source.source_id)
    assert updated_source.country == "Germany"
    assert updated_source.region == "EU"
    assert updated_source.applicable_countries == ["Germany"]

def test_7_version_and_checksum_survive_ingestion():
    """TEST 7: Version and real SHA-256 checksum information survive ingestion."""
    source = LegalSourceMetadata(
        source_id="SRC_TEST_NAGOYA_2026",
        title="Nagoya Protocol Test Document",
        authority="United Nations CBD",
        jurisdiction="International",
        country=None,
        region="International",
        applicable_countries=[],
        source_type="treaty",
        effective_date="2014-10-12",
        version="UNTS Vol 3008 (Amended 2026)",
        source_url="https://www.cbd.int/abs/",
        checksum="init",
        authority_level="statutory"
    )
    
    raw_bytes = b"Article 5: Fair and equitable benefit sharing arising from genetic resources utilization."
    expected_checksum = hashlib.sha256(raw_bytes).hexdigest()
    
    res = ingestion_pipeline.ingest_document_bytes(source, raw_bytes)
    
    assert res.success is True
    assert res.checksum == expected_checksum
    
    # Check registered document
    registered_doc = source_registry.get_document(res.document_id)
    assert registered_doc.checksum == expected_checksum
    assert registered_doc.version == "UNTS Vol 3008 (Amended 2026)"

@pytest.mark.asyncio
async def test_8_download_http_failure_produces_explicit_ingestion_failure():
    """TEST 8: Download HTTP failure produces an explicit ingestion failure without false success."""
    source = LegalSourceMetadata(
        source_id="SRC_TEST_FAIL_404",
        title="Non-Existent Source Document",
        authority="IP India",
        jurisdiction="India",
        source_type="statute",
        effective_date="2026-01-01",
        version="1.0",
        source_url="https://ipindia.gov.in/non-existent-statute-404.pdf",
        checksum="placeholder",
        authority_level="statutory"
    )
    
    res = await ingestion_pipeline.ingest_from_url(source, validate_authority=True)
    assert res.success is False
    assert res.chunks_generated == 0
    assert res.error is not None
    assert "HTTP_ERROR" in res.error or "DOWNLOAD_FAILED" in res.error or "status code" in res.error.lower() or "error" in res.error.lower()

def test_9_unsupported_or_corrupt_document_does_not_produce_fake_chunks():
    """TEST 9: Unsupported or empty/corrupt document does not produce fake successful chunks."""
    source = LegalSourceMetadata(
        source_id="SRC_TEST_CORRUPT",
        title="Corrupt Empty Document",
        authority="WIPO",
        jurisdiction="International",
        source_type="treaty",
        effective_date="2026-01-01",
        version="1.0",
        source_url="https://www.wipo.int/empty.pdf",
        checksum="placeholder",
        authority_level="statutory"
    )
    
    # Ingest empty bytes
    res_empty = ingestion_pipeline.ingest_document_bytes(source, b"")
    assert res_empty.success is False
    assert res_empty.chunks_generated == 0
    assert "EMPTY_OR_CORRUPT" in res_empty.error
    
    # Ingest whitespace only
    res_whitespace = ingestion_pipeline.ingest_document_bytes(source, b"   \n\t  \n  ")
    assert res_whitespace.success is False
    assert res_whitespace.chunks_generated == 0

def test_10_duplicate_content_detected_using_checksum():
    """TEST 10: Duplicate content is detected using cryptographic checksum."""
    shared_content = b"Article 53 EPC: European patents shall not be granted in respect of plant or animal varieties."
    
    source_a = LegalSourceMetadata(
        source_id="SRC_TEST_EPO_DOC_A",
        title="EPC Document Copy A",
        authority="European Patent Office",
        jurisdiction="International",
        country="Germany",
        region="EU",
        source_type="statute",
        effective_date="1973-10-05",
        version="EPC 1973",
        source_url="https://www.epo.org/law-practice/legal-texts/epc.html",
        checksum="a",
        authority_level="statutory"
    )
    
    source_b = LegalSourceMetadata(
        source_id="SRC_TEST_EPO_DOC_B",
        title="EPC Document Copy B (Different URL)",
        authority="European Patent Office",
        jurisdiction="International",
        country="Germany",
        region="EU",
        source_type="statute",
        effective_date="1973-10-05",
        version="EPC 1973",
        source_url="https://www.epo.org/alternative-url/epc.html",
        checksum="b",
        authority_level="statutory"
    )
    
    # Ingest Doc A
    res_a = ingestion_pipeline.ingest_document_bytes(source_a, shared_content)
    assert res_a.success is True
    assert res_a.is_duplicate is False
    
    # Ingest Doc B with identical byte content
    res_b = ingestion_pipeline.ingest_document_bytes(source_b, shared_content)
    assert res_b.success is True
    assert res_b.is_duplicate is True
    assert res_b.checksum == res_a.checksum

def test_11_country_aware_metadata_remains_intact():
    """TEST 11: Country-aware metadata from Step 3 remains intact across the source registry."""
    # Check Germany PatG
    de_source = source_registry.get_source("SRC_DE_PATENT_ACT_PATG")
    assert de_source is not None
    assert de_source.country == "Germany"
    assert de_source.jurisdiction == "International"
    
    # Check US Code 35 USC
    us_source = source_registry.get_source("SRC_US_PATENT_CODE_35USC")
    assert us_source is not None
    assert us_source.country == "USA"
    assert us_source.jurisdiction == "International"
    
    # Check European Patent Convention
    eu_source = source_registry.get_source("SRC_EU_EPC_EPO")
    assert eu_source is not None
    assert eu_source.region == "EU"
    assert "Germany" in eu_source.applicable_countries
    
    # Check International Treaties
    wipo_source = source_registry.get_source("SRC_INT_WIPO_PCT_1970")
    assert wipo_source is not None
    assert wipo_source.source_type == "treaty"
    assert wipo_source.region == "International"
    
    # Check Authority Allowlist
    assert is_authority_allowed("https://ipindia.gov.in/patents-act-1970.htm") is True
    assert is_authority_allowed("https://www.wipo.int/pct/en/") is True
    assert is_authority_allowed("https://www.epo.org/epc.html") is True
    assert is_authority_allowed("https://random-law-blog.com/advice") is False
    assert is_authority_allowed("https://en.wikipedia.org/wiki/Patent") is False
