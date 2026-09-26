import os
import hashlib
import pytest
from unittest.mock import MagicMock, patch

from app.rag.source_registry import (
    source_registry,
    LegalSourceMetadata,
    OfficialSourceDefinition,
    SourceRegistry
)
from app.rag.downloader import DocumentDownloader, DownloadResult
from app.rag.updater import CorpusUpdater, SourceUpdateResult, CorpusUpdateReport
from app.rag.vector_store import VectorStoreInterface
from app.rag.evidence import EvidenceChunk
from app.modules.citations.validator import citation_validator


@pytest.fixture
def mock_updater():
    return CorpusUpdater(concurrency=2, request_delay_seconds=0.0)


@pytest.mark.asyncio
async def test_1_new_source_version_detected(mock_updater):
    """Verify that when a source has new bytes, updater detects it and creates an updated version."""
    test_def = OfficialSourceDefinition(
        source_id="SRC_TEST_NEW_VER",
        title="Test Patent Statute",
        authority="Test Patent Office",
        canonical_url="https://ipindia.gov.in/test-statute.htm",
        jurisdiction="India",
        country="India",
        region="India",
        applicable_countries=["India"],
        source_type="statute",
        authority_level="statutory",
        version="v1.0",
        latest_known_checksum="old_checksum_123"
    )

    new_content = b"Section 1: Short Title\nThis Act may be called the Test Patent Act.\n\nSection 2: Definitions\nInvention means a new product."
    new_checksum = hashlib.sha256(new_content).hexdigest()

    mock_download = DownloadResult(
        success=True,
        url=test_def.canonical_url,
        content_bytes=new_content,
        checksum=new_checksum,
        content_type="text/plain",
        size_bytes=len(new_content)
    )

    with patch("app.rag.updater.document_downloader.download_source_document", return_value=mock_download):
        result = await mock_updater.update_single_source(test_def, dry_run=False)

    assert result.status in ["NEW", "UPDATED"]
    assert result.new_checksum == new_checksum
    assert result.chunks_count > 0

    # Verify registered in source registry
    registered = source_registry.get_source(test_def.source_id)
    assert registered is not None
    assert registered.checksum == new_checksum


@pytest.mark.asyncio
async def test_2_unchanged_checksum_causes_no_reingestion(mock_updater):
    """Verify that when downloaded checksum matches existing source checksum, status is UNCHANGED."""
    test_content = b"Section 3(p): Traditional Knowledge\nTraditional knowledge is not an invention."
    current_checksum = hashlib.sha256(test_content).hexdigest()

    existing_source = LegalSourceMetadata(
        source_id="SRC_TEST_UNCHANGED",
        title="Test TK Statute",
        authority="Test Authority",
        jurisdiction="India",
        country="India",
        applicable_countries=["India"],
        source_type="statute",
        effective_date="2024-01-01",
        version="v1.0",
        source_url="https://ipindia.gov.in/tk.htm",
        checksum=current_checksum
    )
    source_registry.register_source(existing_source)

    test_def = OfficialSourceDefinition(
        source_id="SRC_TEST_UNCHANGED",
        title="Test TK Statute",
        authority="Test Authority",
        canonical_url="https://ipindia.gov.in/tk.htm",
        jurisdiction="India",
        country="India",
        applicable_countries=["India"],
        source_type="statute",
        latest_known_checksum=current_checksum
    )

    mock_download = DownloadResult(
        success=True,
        url=test_def.canonical_url,
        content_bytes=test_content,
        checksum=current_checksum,
        content_type="text/plain",
        size_bytes=len(test_content)
    )

    with patch("app.rag.updater.document_downloader.download_source_document", return_value=mock_download):
        result = await mock_updater.update_single_source(test_def, dry_run=False)

    assert result.status == "UNCHANGED"
    assert result.new_checksum == current_checksum
    assert result.chunks_count == 0


@pytest.mark.asyncio
async def test_3_changed_checksum_creates_new_immutable_version(mock_updater):
    """Verify that changed checksum generates a new version tag and registers it."""
    v1_bytes = b"Section 1: Initial enactment 1970."
    v1_checksum = hashlib.sha256(v1_bytes).hexdigest()

    v1_source = LegalSourceMetadata(
        source_id="SRC_TEST_MUTATION",
        title="Mutation Statute",
        authority="Parliament",
        jurisdiction="India",
        country="India",
        applicable_countries=["India"],
        source_type="statute",
        effective_date="1970-01-01",
        version="v1.0",
        source_url="https://ipindia.gov.in/mutate.htm",
        checksum=v1_checksum
    )
    source_registry.register_source(v1_source)

    v2_bytes = b"Section 1: Amended enactment 2026 with biological disclosure."
    v2_checksum = hashlib.sha256(v2_bytes).hexdigest()

    test_def = OfficialSourceDefinition(
        source_id="SRC_TEST_MUTATION",
        title="Mutation Statute",
        authority="Parliament",
        canonical_url="https://ipindia.gov.in/mutate.htm",
        jurisdiction="India",
        country="India",
        applicable_countries=["India"],
        source_type="statute"
    )

    mock_download = DownloadResult(
        success=True,
        url=test_def.canonical_url,
        content_bytes=v2_bytes,
        checksum=v2_checksum,
        content_type="text/plain",
        size_bytes=len(v2_bytes)
    )

    with patch("app.rag.updater.document_downloader.download_source_document", return_value=mock_download):
        result = await mock_updater.update_single_source(test_def, dry_run=False)

    assert result.status == "UPDATED"
    assert result.new_checksum == v2_checksum
    assert result.previous_checksum == v1_checksum
    assert result.new_version != result.previous_version


def test_4_previous_version_remains_available():
    """Verify that historical versions are preserved immutably in source_versions list."""
    history = source_registry.get_source_versions("SRC_TEST_MUTATION")
    assert len(history) >= 2
    # Verify both v1 checksum and v2 checksum exist in version history
    checksums = [v.checksum for v in history]
    assert len(set(checksums)) >= 2


@pytest.mark.asyncio
async def test_5_failed_download_preserves_last_good_version(mock_updater):
    """Verify that a network failure marks the update as FAILED and preserves previous version."""
    existing = source_registry.get_source("SRC_TEST_MUTATION")
    last_good_checksum = existing.checksum

    test_def = OfficialSourceDefinition(
        source_id="SRC_TEST_MUTATION",
        title="Mutation Statute",
        authority="Parliament",
        canonical_url="https://ipindia.gov.in/mutate.htm",
        jurisdiction="India",
        country="India",
        applicable_countries=["India"],
        source_type="statute"
    )

    mock_failed_download = DownloadResult(
        success=False,
        url=test_def.canonical_url,
        error="HTTP_500_SERVER_ERROR"
    )

    with patch("app.rag.updater.document_downloader.download_source_document", return_value=mock_failed_download):
        result = await mock_updater.update_single_source(test_def, dry_run=False)

    assert result.status == "FAILED"
    assert "HTTP_500" in result.error

    # Verify existing source remains intact
    current = source_registry.get_source("SRC_TEST_MUTATION")
    assert current.checksum == last_good_checksum


@pytest.mark.asyncio
async def test_6_unauthorized_domain_is_rejected(mock_updater):
    """Verify that non-allowlisted domains are rejected immediately."""
    unauthorized_def = OfficialSourceDefinition(
        source_id="SRC_UNAUTHORIZED",
        title="Untrusted Blog",
        authority="Anonymous",
        canonical_url="https://untrusted-blog.com/act.pdf",
        jurisdiction="International",
        country="USA",
        applicable_countries=["USA"],
        source_type="statute"
    )

    result = await mock_updater.update_single_source(unauthorized_def, dry_run=False)
    assert result.status == "FAILED"
    assert "UNAUTHORIZED_DOMAIN" in result.error


@pytest.mark.asyncio
async def test_7_dry_run_performs_no_corpus_mutation(mock_updater):
    """Verify that dry_run=True reports changes without mutating the source registry or vector store."""
    test_def = OfficialSourceDefinition(
        source_id="SRC_TEST_DRYRUN",
        title="Dry Run Statute",
        authority="Test Bureau",
        canonical_url="https://wipo.int/dryrun.pdf",
        jurisdiction="International",
        country="Global",
        applicable_countries=["Global"],
        source_type="treaty"
    )

    content = b"Article 1: Dry run international treaty text."
    checksum = hashlib.sha256(content).hexdigest()

    mock_download = DownloadResult(
        success=True,
        url=test_def.canonical_url,
        content_bytes=content,
        checksum=checksum,
        content_type="text/plain",
        size_bytes=len(content)
    )

    with patch("app.rag.updater.document_downloader.download_source_document", return_value=mock_download):
        result = await mock_updater.update_single_source(test_def, dry_run=True)

    assert result.status == "NEW"
    assert result.new_checksum == checksum

    # Verify that registry was NOT mutated in dry-run mode
    assert source_registry.get_source("SRC_TEST_DRYRUN") is None


@pytest.mark.asyncio
async def test_8_country_jurisdiction_metadata_survives_ingestion(mock_updater):
    """Verify that country, region, and jurisdiction survive automated ingestion into LegalSourceMetadata."""
    german_def = OfficialSourceDefinition(
        source_id="SRC_DE_PATG_UPDATED",
        title="German Patent Act (PatG)",
        authority="DPMA / Federal Ministry of Justice",
        canonical_url="https://gesetze-im-internet.de/patg/index.html",
        jurisdiction="International",
        country="Germany",
        region="EU",
        applicable_countries=["Germany", "EU"],
        source_type="statute",
        authority_level="statutory"
    )

    content = b"Section 1: Patentable Inventions\nPatents shall be granted for any inventions in all fields of technology."
    checksum = hashlib.sha256(content).hexdigest()

    mock_download = DownloadResult(
        success=True,
        url=german_def.canonical_url,
        content_bytes=content,
        checksum=checksum,
        content_type="text/plain",
        size_bytes=len(content)
    )

    with patch("app.rag.updater.document_downloader.download_source_document", return_value=mock_download):
        result = await mock_updater.update_single_source(german_def, dry_run=False)

    assert result.status in ["NEW", "UPDATED"]
    saved = source_registry.get_source("SRC_DE_PATG_UPDATED")
    assert saved.country == "Germany"
    assert saved.jurisdiction == "International"
    assert saved.region == "EU"
    assert "Germany" in saved.applicable_countries


@pytest.mark.asyncio
async def test_9_vector_store_receives_new_version(mock_updater):
    """Verify that the vector store successfully indexes chunks generated by the automated updater."""
    from app.rag.vector_store import vector_store

    initial_count = len(vector_store.chunks)
    new_def = OfficialSourceDefinition(
        source_id="SRC_VS_TEST_SOURCE",
        title="Vector Ingestion Test Statute",
        authority="Test Commission",
        canonical_url="https://uspto.gov/test_act.htm",
        jurisdiction="International",
        country="USA",
        region="North America",
        applicable_countries=["USA"],
        source_type="statute",
        authority_level="statutory"
    )

    content = b"Section 101: Inventions Patentable\nWhoever invents or discovers any new and useful process, machine, manufacture, or composition of matter."
    checksum = hashlib.sha256(content).hexdigest()

    mock_download = DownloadResult(
        success=True,
        url=new_def.canonical_url,
        content_bytes=content,
        checksum=checksum,
        content_type="text/plain",
        size_bytes=len(content)
    )

    with patch("app.rag.updater.document_downloader.download_source_document", return_value=mock_download):
        res = await mock_updater.update_single_source(new_def, dry_run=False)

    assert res.status in ["NEW", "UPDATED"]
    assert len(vector_store.chunks) > initial_count


@pytest.mark.asyncio
async def test_10_citation_metadata_remains_compatible():
    """Verify that chunks produced from automated updater are fully compatible with citation validator."""
    from app.rag.vector_store import vector_store

    # Retrieve chunks for German Patent Act
    matching_chunks = [c for c in vector_store.chunks if c.country == "Germany"]
    assert len(matching_chunks) > 0

    chunk = matching_chunks[0]
    # Check that mandatory citation fields are populated
    assert chunk.source_id is not None
    assert chunk.jurisdiction == "International"
    assert chunk.country == "Germany"
    assert chunk.section or chunk.article
    assert len(chunk.text) > 0


@pytest.mark.asyncio
async def test_11_multiple_sources_continue_when_one_fails(mock_updater):
    """Verify that run_update_cycle continues processing remaining sources when one source fails."""
    def1 = OfficialSourceDefinition(
        source_id="SRC_CYCLE_PASS_1",
        title="Pass Statute 1",
        authority="Auth 1",
        canonical_url="https://ipindia.gov.in/pass1.htm",
        jurisdiction="India",
        country="India",
        applicable_countries=["India"],
        source_type="statute"
    )
    def2 = OfficialSourceDefinition(
        source_id="SRC_CYCLE_FAIL",
        title="Fail Statute",
        authority="Auth 2",
        canonical_url="https://untrusted-domain.com/fail.htm",
        jurisdiction="India",
        country="India",
        applicable_countries=["India"],
        source_type="statute"
    )
    def3 = OfficialSourceDefinition(
        source_id="SRC_CYCLE_PASS_2",
        title="Pass Statute 2",
        authority="Auth 3",
        canonical_url="https://wipo.int/pass2.htm",
        jurisdiction="International",
        country="Global",
        applicable_countries=["Global"],
        source_type="treaty"
    )

    source_registry.register_official_definition(def1)
    source_registry.register_official_definition(def2)
    source_registry.register_official_definition(def3)

    mock_download = DownloadResult(
        success=True,
        url="https://wipo.int/pass2.htm",
        content_bytes=b"Article 5: Sample Treaty Text",
        checksum="sample_checksum_555",
        content_type="text/plain",
        size_bytes=25
    )

    with patch("app.rag.updater.document_downloader.download_source_document", return_value=mock_download):
        report = await mock_updater.run_update_cycle(
            dry_run=True,
            source_ids=["SRC_CYCLE_PASS_1", "SRC_CYCLE_FAIL", "SRC_CYCLE_PASS_2"]
        )

    assert report.total_sources_checked == 3
    assert report.failed_sources == 1
    assert report.new_sources + report.updated_sources + report.unchanged_sources == 2


@pytest.mark.asyncio
async def test_12_duplicate_ingestion_is_idempotent(mock_updater):
    """Verify that ingesting the exact same source document multiple times is idempotent."""
    test_def = OfficialSourceDefinition(
        source_id="SRC_IDEMPOTENT_TEST",
        title="Idempotent Test Act",
        authority="Authority",
        canonical_url="https://ipindia.gov.in/idempotent.htm",
        jurisdiction="India",
        country="India",
        applicable_countries=["India"],
        source_type="statute"
    )

    content = b"Section 1: Fixed Content for Idempotency Test"
    checksum = hashlib.sha256(content).hexdigest()

    mock_download = DownloadResult(
        success=True,
        url=test_def.canonical_url,
        content_bytes=content,
        checksum=checksum,
        content_type="text/plain",
        size_bytes=len(content)
    )

    with patch("app.rag.updater.document_downloader.download_source_document", return_value=mock_download):
        res1 = await mock_updater.update_single_source(test_def, dry_run=False)
        res2 = await mock_updater.update_single_source(test_def, dry_run=False)

    assert res1.status in ["NEW", "UPDATED"]
    # Second run with same checksum is detected as UNCHANGED
    assert res2.status == "UNCHANGED"
    assert res2.new_checksum == checksum
