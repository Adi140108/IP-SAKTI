import asyncio
import hashlib
import logging
from datetime import datetime
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field

from app.rag.source_registry import (
    source_registry,
    LegalSourceMetadata,
    SourceDocument,
    OfficialSourceDefinition,
    is_authority_allowed
)
from app.rag.downloader import document_downloader
from app.rag.ingestion import ingestion_pipeline
from app.rag.vector_store import vector_store

logger = logging.getLogger("IP-SAKTI.CorpusUpdater")


class SourceUpdateResult(BaseModel):
    source_id: str
    title: str
    status: str  # "UNCHANGED", "UPDATED", "NEW", "FAILED"
    canonical_url: str
    previous_checksum: Optional[str] = None
    new_checksum: Optional[str] = None
    previous_version: Optional[str] = None
    new_version: Optional[str] = None
    chunks_count: int = 0
    bytes_downloaded: int = 0
    checked_at: str
    error: Optional[str] = None


class CorpusUpdateReport(BaseModel):
    started_at: str
    completed_at: str
    dry_run: bool
    total_sources_checked: int
    unchanged_sources: int
    updated_sources: int
    new_sources: int
    failed_sources: int
    source_results: Dict[str, SourceUpdateResult] = Field(default_factory=dict)


class CorpusUpdater:
    """
    Controlled, version-aware automated updater for authoritative legal sources.
    
    Guarantees:
    1. Only official allowlisted domains are contacted.
    2. Byte-level cryptographic SHA-256 hashing detects real document changes.
    3. Historical source versions and vector chunks are preserved immutably.
    4. Failed downloads never delete, overwrite, or corrupt the existing valid corpus.
    5. Dry-run mode allows complete non-destructive discovery and checksum auditing.
    6. Politeness limits (bounded concurrency and request delays) prevent aggressive scraping.
    """

    def __init__(self, concurrency: int = 3, request_delay_seconds: float = 0.2):
        self.concurrency = concurrency
        self.request_delay_seconds = request_delay_seconds

    async def update_single_source(
        self,
        definition: OfficialSourceDefinition,
        dry_run: bool = False
    ) -> SourceUpdateResult:
        """
        Check and update a single authoritative source definition.
        """
        now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        # 1. Validate domain security allowlist
        if not is_authority_allowed(definition.canonical_url):
            err = f"UNAUTHORIZED_DOMAIN: Domain for {definition.canonical_url} is not an approved statutory authority."
            logger.error(err)
            return SourceUpdateResult(
                source_id=definition.source_id,
                title=definition.title,
                status="FAILED",
                canonical_url=definition.canonical_url,
                checked_at=now_str,
                error=err
            )

        # 2. Download canonical source document bytes
        download_res = await document_downloader.download_source_document(
            definition.canonical_url,
            validate_authority=True
        )

        if not download_res.success:
            logger.warning(f"Download failed for {definition.source_id} ({definition.canonical_url}): {download_res.error}")
            return SourceUpdateResult(
                source_id=definition.source_id,
                title=definition.title,
                status="FAILED",
                canonical_url=definition.canonical_url,
                checked_at=now_str,
                error=download_res.error
            )

        # 3. Calculate Cryptographic SHA-256 on actual downloaded bytes
        new_checksum = download_res.checksum
        existing_source = source_registry.get_source(definition.source_id)

        # 4. Compare against latest known checksum
        if existing_source and existing_source.checksum and existing_source.checksum.lower() == new_checksum.lower():
            logger.info(f"UNCHANGED: Source '{definition.title}' checksum matches current active version.")
            return SourceUpdateResult(
                source_id=definition.source_id,
                title=definition.title,
                status="UNCHANGED",
                canonical_url=definition.canonical_url,
                previous_checksum=existing_source.checksum,
                new_checksum=new_checksum,
                previous_version=existing_source.version,
                new_version=existing_source.version,
                bytes_downloaded=download_res.size_bytes,
                checked_at=now_str
            )

        # 5. Handle Content Change / New Source
        is_new = existing_source is None
        prev_version = existing_source.version if existing_source else None
        prev_checksum = existing_source.checksum if existing_source else None

        # Determine new version tag
        history = source_registry.get_source_versions(definition.source_id)
        version_num = len(history) + 1
        new_version_tag = f"v{version_num}.0_{datetime.now().strftime('%Y%m%d')}"

        if dry_run:
            logger.info(f"DRY-RUN: Detected change for '{definition.title}' (Checksum: {new_checksum[:8]}...). No corpus mutation applied.")
            return SourceUpdateResult(
                source_id=definition.source_id,
                title=definition.title,
                status="NEW" if is_new else "UPDATED",
                canonical_url=definition.canonical_url,
                previous_checksum=prev_checksum,
                new_checksum=new_checksum,
                previous_version=prev_version,
                new_version=new_version_tag,
                bytes_downloaded=download_res.size_bytes,
                checked_at=now_str
            )

        # 6. Parse and Chunk Content
        parsed_sections = ingestion_pipeline.parse_document_text(
            download_res.content_bytes,
            content_type=download_res.content_type
        )

        if not parsed_sections:
            err = f"PARSE_FAILURE: Failed to extract structured sections from {definition.canonical_url}"
            logger.error(err)
            return SourceUpdateResult(
                source_id=definition.source_id,
                title=definition.title,
                status="FAILED",
                canonical_url=definition.canonical_url,
                checked_at=now_str,
                error=err
            )

        # 7. Create New Version Metadata and Preserve Historical Version
        new_source_metadata = LegalSourceMetadata(
            source_id=definition.source_id,
            title=definition.title,
            authority=definition.authority,
            jurisdiction=definition.jurisdiction,
            country=definition.country,
            region=definition.region,
            applicable_countries=definition.applicable_countries,
            source_type=definition.source_type,
            authority_level=definition.authority_level,
            effective_date=datetime.now().strftime("%Y-%m-%d"),
            version=new_version_tag,
            retrieved_at=now_str,
            source_url=definition.canonical_url,
            checksum=new_checksum
        )

        document_id = f"DOC_{definition.source_id}_{new_checksum[:8]}"
        chunks = ingestion_pipeline.process_and_chunk_source(
            source=new_source_metadata,
            raw_text_sections=parsed_sections,
            document_id=document_id,
            checksum=new_checksum
        )

        # Register raw document and new version in registry
        doc = SourceDocument(
            document_id=document_id,
            source_id=definition.source_id,
            source_url=definition.canonical_url,
            checksum=new_checksum,
            content_type=download_res.content_type,
            size_bytes=download_res.size_bytes,
            retrieved_at=now_str,
            version=new_version_tag
        )
        source_registry.register_document(doc)
        source_registry.register_source(new_source_metadata)

        # Ingest new chunks into persistent vector store
        added_count = vector_store.add_chunks(chunks)

        logger.info(f"INGESTION COMPLETE: Source '{definition.title}' updated to {new_version_tag} ({len(chunks)} chunks indexed).")
        return SourceUpdateResult(
            source_id=definition.source_id,
            title=definition.title,
            status="NEW" if is_new else "UPDATED",
            canonical_url=definition.canonical_url,
            previous_checksum=prev_checksum,
            new_checksum=new_checksum,
            previous_version=prev_version,
            new_version=new_version_tag,
            chunks_count=len(chunks),
            bytes_downloaded=download_res.size_bytes,
            checked_at=now_str
        )

    async def run_update_cycle(
        self,
        dry_run: bool = False,
        source_ids: Optional[List[str]] = None
    ) -> CorpusUpdateReport:
        """
        Execute an automated update cycle across configured official sources.
        """
        started_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        definitions = source_registry.list_official_definitions(enabled_only=True)

        if source_ids:
            target_ids = set(source_ids)
            definitions = [d for d in definitions if d.source_id in target_ids]

        semaphore = asyncio.Semaphore(self.concurrency)
        results: Dict[str, SourceUpdateResult] = {}

        async def _bounded_update(defn: OfficialSourceDefinition):
            async with semaphore:
                if self.request_delay_seconds > 0:
                    await asyncio.sleep(self.request_delay_seconds)
                res = await self.update_single_source(defn, dry_run=dry_run)
                results[defn.source_id] = res

        tasks = [_bounded_update(d) for d in definitions]
        if tasks:
            await asyncio.gather(*tasks, return_exceptions=False)

        completed_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        unchanged = sum(1 for r in results.values() if r.status == "UNCHANGED")
        updated = sum(1 for r in results.values() if r.status == "UPDATED")
        new_cnt = sum(1 for r in results.values() if r.status == "NEW")
        failed = sum(1 for r in results.values() if r.status == "FAILED")

        return CorpusUpdateReport(
            started_at=started_at,
            completed_at=completed_at,
            dry_run=dry_run,
            total_sources_checked=len(results),
            unchanged_sources=unchanged,
            updated_sources=updated,
            new_sources=new_cnt,
            failed_sources=failed,
            source_results=results
        )


corpus_updater = CorpusUpdater()
