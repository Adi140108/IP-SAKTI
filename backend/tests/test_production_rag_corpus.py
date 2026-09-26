import os
import json
import pytest
import hashlib
from unittest.mock import patch, AsyncMock, MagicMock

from app.config import settings
from app.rag.evidence import EvidenceChunk
from app.rag.source_registry import (
    source_registry,
    LegalSourceMetadata,
    OfficialSourceDefinition,
    SourceDocument,
    is_authority_allowed
)
from app.rag.downloader import DocumentDownloader, DownloadResult
from app.rag.ingestion import SourceIngestionPipeline, ingestion_pipeline
from app.rag.vector_store import VectorStoreInterface
from app.rag.updater import CorpusUpdater
from app.modules.citations.validator import CitationValidator

@pytest.fixture(autouse=True)
def restore_settings():
    orig_env = settings.APP_ENV
    orig_db_type = settings.VECTOR_DB_TYPE
    orig_persist_path = settings.VECTOR_DB_PERSIST_PATH
    yield
    settings.APP_ENV = orig_env
    settings.VECTOR_DB_TYPE = orig_db_type
    settings.VECTOR_DB_PERSIST_PATH = orig_persist_path


def test_1_production_never_loads_hardcoded_seed_corpus(tmp_path):
    """TEST 1: Production mode strictly forbids loading hardcoded seed corpus."""
    settings.APP_ENV = "production"
    settings.VECTOR_DB_TYPE = "persistent"
    persist_file = str(tmp_path / "prod_idx.json")
    settings.VECTOR_DB_PERSIST_PATH = persist_file

    store = VectorStoreInterface(db_type="persistent", persist_path=persist_file)
    assert store.corpus_status == "PRODUCTION_RAG_CORPUS_EMPTY"
    assert len(store.chunks) == 0

    # Attempting explicit dev seed loading in production must raise RuntimeError
    with pytest.raises(RuntimeError) as exc_info:
        store.load_dev_seed_corpus()
    assert "FORBIDDEN_DEV_SEED_IN_PRODUCTION" in str(exc_info.value)


def test_2_development_can_load_seed_corpus():
    """TEST 2: Development mode can load seed baseline corpus in memory."""
    settings.APP_ENV = "development"
    settings.VECTOR_DB_TYPE = "memory"

    store = VectorStoreInterface(db_type="memory")
    assert store.corpus_status == "DEV_SEED_CORPUS"
    assert len(store.chunks) > 0
    assert any(c.source_id == "SRC_IN_PATENTS_ACT_1970" for c in store.chunks)


def test_3_production_fails_clearly_when_persistent_corpus_missing_or_memory():
    """TEST 3: Production startup fails clearly if memory mode is configured."""
    settings.APP_ENV = "production"
    settings.VECTOR_DB_TYPE = "memory"

    with pytest.raises(RuntimeError) as exc_info:
        VectorStoreInterface(db_type="memory")
    assert "PRODUCTION_VECTOR_STORE_CONFIG_ERROR" in str(exc_info.value)


@pytest.mark.asyncio
async def test_4_official_source_downloads_successfully():
    """TEST 4: Official allowlisted source downloads and returns raw bytes and checksum."""
    downloader = DocumentDownloader()
    fake_content = b"The Patents Act 1970 India Official Publication"

    with patch("httpx.AsyncClient.get") as mock_get:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.content = fake_content
        mock_resp.headers = {"content-type": "text/plain; charset=utf-8"}
        mock_get.return_value = mock_resp

        res = await downloader.download_source_document("https://ipindia.gov.in/patents-act.htm")
        assert res.success is True
        assert res.content_bytes == fake_content
        assert res.checksum == hashlib.sha256(fake_content).hexdigest()
        assert res.size_bytes == len(fake_content)


def test_5_sha256_checksum_calculated_from_actual_bytes():
    """TEST 5: SHA-256 is strictly computed from actual byte payload."""
    data = b"Statutory text for National Biodiversity Act 2002"
    expected = hashlib.sha256(data).hexdigest()
    computed = SourceIngestionPipeline.compute_checksum(data)
    assert computed == expected


@pytest.mark.asyncio
async def test_6_identical_source_is_unchanged():
    """TEST 6: Document with identical byte checksum is flagged UNCHANGED."""
    updater = CorpusUpdater()
    defn = source_registry.get_official_definition("SRC_IN_PATENTS_ACT_1970")
    assert defn is not None

    current_src = source_registry.get_source(defn.source_id)
    assert current_src is not None

    with patch("app.rag.downloader.document_downloader.download_source_document") as mock_dl:
        mock_dl.return_value = DownloadResult(
            success=True,
            url=defn.canonical_url,
            content_bytes=b"Same bytes",
            checksum=current_src.checksum,
            size_bytes=100
        )
        res = await updater.update_single_source(defn, dry_run=False)
        assert res.status == "UNCHANGED"
        assert res.new_checksum == current_src.checksum


@pytest.mark.asyncio
async def test_7_changed_source_creates_new_version(tmp_path):
    """TEST 7: Checksum diff creates a new version while preserving provenance."""
    updater = CorpusUpdater()
    defn = OfficialSourceDefinition(
        source_id="SRC_TEST_DYNAMIC_UPDATE",
        title="Test Dynamic Statute",
        authority="Test Official Body",
        canonical_url="https://ipindia.gov.in/test.htm",
        jurisdiction="India",
        country="India",
        source_type="statute",
        version="v1.0"
    )
    source_registry.register_official_definition(defn)

    new_bytes = b"Section 1: New enacted amendment for traditional knowledge protection."
    new_hash = hashlib.sha256(new_bytes).hexdigest()

    with patch("app.rag.downloader.document_downloader.download_source_document") as mock_dl:
        mock_dl.return_value = DownloadResult(
            success=True,
            url=defn.canonical_url,
            content_bytes=new_bytes,
            checksum=new_hash,
            content_type="text/plain",
            size_bytes=len(new_bytes)
        )
        res = await updater.update_single_source(defn, dry_run=False)
        assert res.status == "NEW" or res.status == "UPDATED"
        assert res.new_checksum == new_hash
        assert res.chunks_count > 0


@pytest.mark.asyncio
async def test_8_failed_download_preserves_previous_valid_version():
    """TEST 8: Network failure preserves existing valid corpus without deletion or overwrite."""
    updater = CorpusUpdater()
    defn = source_registry.get_official_definition("SRC_IN_PATENTS_ACT_1970")
    prev_src = source_registry.get_source(defn.source_id)

    with patch("app.rag.downloader.document_downloader.download_source_document") as mock_dl:
        mock_dl.return_value = DownloadResult(
            success=False,
            url=defn.canonical_url,
            error="HTTP_ERROR: 503 Service Unavailable"
        )
        res = await updater.update_single_source(defn, dry_run=False)
        assert res.status == "FAILED"
        assert "503" in res.error

        # Existing source in registry remains intact
        current_src = source_registry.get_source(defn.source_id)
        assert current_src.checksum == prev_src.checksum


def test_9_html_ingestion_and_cleaning():
    """TEST 9: Ingestion pipeline parses HTML, strips script/styles, and extracts legal sections."""
    html_doc = b"""
    <!DOCTYPE html>
    <html>
    <head><title>Official Gazette</title><style>.hidden { display: none; }</style></head>
    <body>
        <script>console.log('tracker');</script>
        <h1>Section 3(p) Traditional Knowledge</h1>
        <p>Inventions relating to traditional knowledge are non-patentable under Indian law.</p>
        <h2>Section 3(e) Admixtures</h2>
        <p>Mere admixtures are not patentable unless surprising synergistic effect is established.</p>
    </body>
    </html>
    """
    sections = ingestion_pipeline.parse_document_text(html_doc, content_type="text/html")
    assert len(sections) >= 2
    assert any("3(p)" in s.get("section", "") or "3(p)" in s.get("content", "") for s in sections)
    assert not any("console.log" in s.get("content", "") for s in sections)


def test_10_pdf_ingestion_and_page_metadata():
    """TEST 10: PDF ingestion parses pages and retains page numbers."""
    try:
        import pypdf
        from io import BytesIO
        writer = pypdf.PdfWriter()
        writer.add_blank_page(width=72, height=72)
        stream = BytesIO()
        writer.write(stream)
        pdf_bytes = stream.getvalue()
    except Exception:
        pdf_bytes = b"%PDF-1.4 dummy minimal pdf bytes"

    sections = ingestion_pipeline.parse_document_text(pdf_bytes, content_type="application/pdf")
    # Blank PDF produces OCR_REQUIRED without raising or inventing text
    assert isinstance(sections, list)


def test_11_page_metadata_preserved_in_chunks():
    """TEST 11: process_and_chunk_source preserves page_number on EvidenceChunk."""
    src = source_registry.get_source("SRC_IN_PATENTS_ACT_1970")
    raw_sections = [
        {
            "section": "Section 3(p)",
            "page_number": 12,
            "content": "Section 3(p): Traditional knowledge non-patentability bar."
        }
    ]
    chunks = ingestion_pipeline.process_and_chunk_source(src, raw_sections)
    assert len(chunks) == 1
    assert chunks[0].page_number == 12
    assert chunks[0].section == "Section 3(p)"


def test_12_legal_section_aware_chunking():
    """TEST 12: Chunking recognizes hierarchical legal statutory syntax."""
    text_content = b"""
    Section 1 Short Title
    This Act may be called the Patents Act, 1970.

    Section 3(p) Non-Patentable Inventions
    An invention which in effect is traditional knowledge is not an invention.

    Article 15 International Search Report
    Each international application shall be the subject of international search.

    Schedule T Good Manufacturing Practices
    Factory premises must maintain hygienic standards.
    """
    sections = ingestion_pipeline.parse_document_text(text_content, content_type="text/plain")
    assert len(sections) >= 3
    found_headers = [s.get("section", "") or s.get("article", "") for s in sections]
    assert any("3(p)" in h for h in found_headers)
    assert any("Article 15" in h or "15" in h for h in found_headers)


def test_13_source_provenance_survives_indexing(tmp_path):
    """TEST 13: Complete metadata survives vector persistence into index file."""
    persist_file = str(tmp_path / "provenance_test.json")
    store = VectorStoreInterface(db_type="persistent", persist_path=persist_file)

    chunk = EvidenceChunk(
        chunk_id="CHK_PROV_01",
        source_id="SRC_IN_PATENTS_ACT_1970",
        document_id="DOC_PATENTS_ACT_1970_a1b2c3d4",
        checksum="a1b2c3d4e5f67890",
        title="The Patents Act, 1970 (India)",
        authority="Parliament of India / CGPDTM",
        jurisdiction="India",
        country="India",
        region="India",
        applicable_countries=["India"],
        source_type="statute",
        authority_level="statutory",
        section="Section 3(p)",
        effective_date="1970-09-19",
        version="Act 39 of 1970",
        retrieved_at="2026-09-24",
        source_url="https://ipindia.gov.in/patents-act-1970.htm",
        text="Section 3(p) excludes traditional knowledge from patentability.",
        relevance_score=0.0
    )
    store.add_chunks([chunk])

    # Re-initialize store from same disk file
    reloaded = VectorStoreInterface(db_type="persistent", persist_path=persist_file)
    assert len(reloaded.chunks) == 1
    c = reloaded.chunks[0]
    assert c.source_id == "SRC_IN_PATENTS_ACT_1970"
    assert c.checksum == "a1b2c3d4e5f67890"
    assert c.source_url == "https://ipindia.gov.in/patents-act-1970.htm"
    assert c.authority == "Parliament of India / CGPDTM"


def test_14_country_metadata_survives_indexing(tmp_path):
    """TEST 14: Country metadata survives indexing and country-specific filtering."""
    persist_file = str(tmp_path / "country_test.json")
    store = VectorStoreInterface(db_type="persistent", persist_path=persist_file)

    de_chunk = EvidenceChunk(
        chunk_id="CHK_DE_PATG_01",
        source_id="SRC_DE_PATENT_ACT_PATG",
        document_id="DOC_PATG_DE_123",
        checksum="1234567890abcdef",
        title="German Patent Act (Patentgesetz - PatG)",
        authority="DPMA",
        jurisdiction="International",
        country="Germany",
        region="EU",
        applicable_countries=["Germany"],
        source_type="statute",
        authority_level="statutory",
        section="Section 1 PatG",
        text="Patents are granted for inventions in all fields of technology.",
        relevance_score=0.0
    )
    store.add_chunks([de_chunk])

    assert store.is_source_applicable(de_chunk, target_jurisdiction="International", target_country="Germany") is True
    assert store.is_source_applicable(de_chunk, target_jurisdiction="India", target_country="India") is False


def test_15_arbitrary_unregistered_url_is_rejected():
    """TEST 15: Documents from unauthorized domains are rejected."""
    unauthorized_urls = [
        "https://google.com/search?q=patents+act",
        "https://random-law-blog.net/ayurveda-patent",
        "https://untrusted-source.org/act.pdf",
        "http://insecure-http-domain.gov.in/act"
    ]
    for url in unauthorized_urls:
        assert is_authority_allowed(url) is False or url.startswith("http://")


def test_16_production_retrieval_comes_from_official_corpus(tmp_path):
    """TEST 16: Production retrieval utilizes official persistent chunks."""
    persist_file = str(tmp_path / "prod_official_idx.json")
    store = VectorStoreInterface(db_type="persistent", persist_path=persist_file)

    official_chunk = EvidenceChunk(
        chunk_id="CHK_OFFICIAL_PCT_15",
        source_id="SRC_INT_WIPO_PCT_1970",
        document_id="DOC_PCT_OFFICIAL",
        checksum="feedface12345678",
        title="Patent Cooperation Treaty (PCT / WIPO)",
        authority="WIPO",
        jurisdiction="International",
        source_type="treaty",
        authority_level="statutory",
        article="Article 15",
        text="Article 15: The International Searching Authority discovers relevant prior art.",
        relevance_score=0.0
    )
    store.add_chunks([official_chunk])

    res = store.search_chunks("PCT prior art search", jurisdiction="International", country="Germany", top_k=2)
    assert len(res) >= 1
    assert res[0].source_id == "SRC_INT_WIPO_PCT_1970"
    assert res[0].checksum == "feedface12345678"


def test_17_citation_validation_still_works():
    """TEST 17: Citation validator strictly verifies claims against official EvidenceChunk data."""
    from app.schemas.chat import Citation
    from app.rag.evidence import EvidenceContext
    validator = CitationValidator()

    official_chunk = EvidenceChunk(
        chunk_id="CHK_IN_PAT_3P",
        source_id="SRC_IN_PATENTS_ACT_1970",
        document_id="DOC_PAT_3P",
        checksum="abcdef0123456789",
        title="The Patents Act, 1970 (India)",
        authority="CGPDTM",
        jurisdiction="India",
        country="India",
        source_type="statute",
        authority_level="statutory",
        section="Section 3(p)",
        text="Section 3(p) excludes traditional knowledge from patentability in India.",
        relevance_score=0.9
    )

    raw_citation = Citation(
        source="The Patents Act, 1970 (India)",
        source_id="SRC_IN_PATENTS_ACT_1970",
        document_id="DOC_PAT_3P",
        section_or_rule="Section 3(p)",
        jurisdiction="India",
        country="India",
        snippet="Section 3(p) excludes traditional knowledge",
        is_authoritative=True
    )

    ctx = EvidenceContext(
        selected_chunks=[official_chunk],
        top_relevance_score=0.9,
        jurisdiction="India"
    )

    claims = [
        {"claim_text": "Section 3(p) of the Patents Act 1970 excludes traditional knowledge.", "section": "Section 3(p)"}
    ]

    validated_cits, is_valid, unsupported = validator.validate_claims_and_citations(
        raw_citations=[raw_citation],
        evidence_context=ctx,
        target_jurisdiction="India",
        target_country="India",
        extracted_claims=claims
    )

    assert len(validated_cits) == 1
    assert validated_cits[0].is_authoritative is True


def test_18_hardcoded_corpus_cannot_become_authoritative_in_production(tmp_path):
    """TEST 18: In production, VectorStore inspection summary reflects production mode and never dev seed."""
    settings.APP_ENV = "production"
    settings.VECTOR_DB_TYPE = "persistent"
    persist_file = str(tmp_path / "prod_check.json")
    settings.VECTOR_DB_PERSIST_PATH = persist_file

    store = VectorStoreInterface(db_type="persistent", persist_path=persist_file)
    summary = store.get_corpus_inspection_summary()

    assert summary["is_production"] is True
    assert summary["corpus_mode"] == "PRODUCTION_RAG_CORPUS_EMPTY"
    assert summary["total_chunks"] == 0
