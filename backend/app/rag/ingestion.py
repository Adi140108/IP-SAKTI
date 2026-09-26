import hashlib
import logging
import re
from typing import List, Dict, Any, Optional
from datetime import datetime
from app.rag.source_registry import (
    source_registry,
    LegalSourceMetadata,
    SourceDocument,
    IngestionResult,
    is_authority_allowed
)
from app.rag.evidence import EvidenceChunk
from app.rag.downloader import document_downloader

logger = logging.getLogger("IP-SAKTI.SourceIngestion")

class SourceIngestionPipeline:
    """
    Authoritative Legal Document Ingestion & Chunking Pipeline.
    Manages document lifecycle: download -> SHA-256 byte hashing -> validation -> parsing -> provenance chunking.
    """

    @staticmethod
    def compute_checksum(data: bytes) -> str:
        """Calculate cryptographic SHA-256 hash strictly from actual document bytes."""
        if not isinstance(data, (bytes, bytearray)):
            raise TypeError("Checksum calculation requires raw bytes.")
        return hashlib.sha256(data).hexdigest()

    def parse_document_text(self, raw_bytes: bytes, content_type: str = "text/plain") -> List[Dict[str, str]]:
        """
        Parse raw document bytes into structured statutory sections.
        Returns empty list if document is empty, corrupt, or unparseable.
        """
        if not raw_bytes or len(raw_bytes.strip()) == 0:
            return []

        # Attempt UTF-8 / latin-1 decoding
        try:
            text = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            try:
                text = raw_bytes.decode("latin-1")
            except Exception as e:
                logger.error(f"Failed to decode document bytes: {e}")
                return []

        cleaned_text = text.strip()
        if not cleaned_text:
            return []

        sections = []

        # 1. Look for structured statutory headers (e.g. "Section 3(p)..." or "Article 15...")
        pattern = re.compile(
            r'(?:^|\n)(?P<header>(?:Section|Sec\.|Article|Art\.|Rule|Monograph)\s+[0-9a-zA-Z\(\)\.\s\-]+?)(?:\:|\n|\s{2,})',
            re.IGNORECASE
        )
        matches = list(pattern.finditer(cleaned_text))

        if matches and len(matches) > 1:
            for i, match in enumerate(matches):
                header = match.group("header").strip()
                start_pos = match.end()
                end_pos = matches[i + 1].start() if i + 1 < len(matches) else len(cleaned_text)
                body = cleaned_text[start_pos:end_pos].strip()

                if body:
                    sec_type = "article" if "art" in header.lower() else "section"
                    sections.append({
                        sec_type: header,
                        "content": f"{header}: {body}" if not body.startswith(header) else body
                    })
        elif "\n\n" in cleaned_text:
            # 2. Paragraph / block-based parsing
            paragraphs = [p.strip() for p in cleaned_text.split("\n\n") if len(p.strip()) > 20]
            for idx, p in enumerate(paragraphs):
                sections.append({
                    "section": f"Paragraph {idx + 1}",
                    "content": p
                })
        else:
            # 3. Single continuous text
            if len(cleaned_text) > 10:
                sections.append({
                    "section": "General Provision",
                    "content": cleaned_text
                })

        return sections

    def process_and_chunk_source(
        self,
        source: LegalSourceMetadata,
        raw_text_sections: List[Dict[str, Any]],
        document_id: Optional[str] = None,
        checksum: Optional[str] = None
    ) -> List[EvidenceChunk]:
        """
        Process legal source sections into metadata-rich EvidenceChunks,
        attaching complete document provenance and byte checksum.
        """
        chunks = []
        actual_checksum = checksum or source.checksum
        doc_id = document_id or f"DOC_{source.source_id}"

        for idx, sec in enumerate(raw_text_sections):
            chunk_id = f"CHK_{source.source_id}_{idx+1}"
            section_val = sec.get("section", "")
            article_val = sec.get("article", "")
            content_text = sec.get("content", "").strip()

            if not content_text:
                continue

            chunk = EvidenceChunk(
                chunk_id=chunk_id,
                source_id=source.source_id,
                document_id=doc_id,
                checksum=actual_checksum,
                title=source.title,
                authority=source.authority,
                jurisdiction=source.jurisdiction,
                country=source.country,
                region=source.region,
                applicable_countries=source.applicable_countries,
                source_type=source.source_type,
                authority_level=source.authority_level,
                section=section_val,
                article=article_val,
                effective_date=source.effective_date,
                version=source.version,
                retrieved_at=source.retrieved_at,
                source_url=source.source_url,
                text=content_text,
                relevance_score=0.0
            )
            chunks.append(chunk)

        logger.info(f"Ingested {len(chunks)} legal chunks for source '{source.title}' (Checksum: {actual_checksum[:12]}...)")
        return chunks

    def ingest_document_bytes(
        self,
        source: LegalSourceMetadata,
        raw_bytes: bytes,
        filename: Optional[str] = None,
        content_type: str = "text/plain",
        storage_ref: Optional[str] = None
    ) -> IngestionResult:
        """
        Ingest an actual source document from raw bytes.
        Validates content, computes SHA-256 byte checksum, checks duplicates, parses sections, and chunks.
        """
        if not raw_bytes or len(raw_bytes.strip()) == 0:
            return IngestionResult(
                success=False,
                source_id=source.source_id,
                error="EMPTY_OR_CORRUPT_BYTES: Document contains 0 bytes."
            )

        # 1. Compute Cryptographic SHA-256 strictly on actual document bytes
        checksum = self.compute_checksum(raw_bytes)
        document_id = f"DOC_{source.source_id}_{checksum[:8]}"
        retrieved_at = datetime.now().strftime("%Y-%m-%d")

        # 2. Duplicate Detection via Checksum
        existing_doc = source_registry.get_document_by_checksum(checksum)
        if existing_doc:
            logger.info(f"DUPLICATE DETECTED: Document checksum {checksum} already registered under {existing_doc.document_id}")
            return IngestionResult(
                success=True,
                source_id=source.source_id,
                document_id=existing_doc.document_id,
                checksum=checksum,
                total_sections=0,
                chunks_generated=0,
                is_duplicate=True
            )

        # 3. Parse Document Content
        parsed_sections = self.parse_document_text(raw_bytes, content_type=content_type)
        if not parsed_sections:
            return IngestionResult(
                success=False,
                source_id=source.source_id,
                document_id=document_id,
                checksum=checksum,
                error="UNPARSEABLE_DOCUMENT: Failed to extract statutory text sections from document."
            )

        # 4. Generate Provenance-Rich EvidenceChunks
        chunks = self.process_and_chunk_source(
            source=source,
            raw_text_sections=parsed_sections,
            document_id=document_id,
            checksum=checksum
        )

        if not chunks:
            return IngestionResult(
                success=False,
                source_id=source.source_id,
                document_id=document_id,
                checksum=checksum,
                error="CHUNK_GENERATION_FAILED: No valid chunks produced from parsed text."
            )

        # 5. Register Ingested Document & Update Registry Metadata
        doc = SourceDocument(
            document_id=document_id,
            source_id=source.source_id,
            source_url=source.source_url,
            checksum=checksum,
            content_type=content_type,
            size_bytes=len(raw_bytes),
            retrieved_at=retrieved_at,
            version=source.version,
            storage_ref=storage_ref
        )
        source_registry.register_document(doc)

        # Update source metadata in registry with real checksum
        source.checksum = checksum
        source.retrieved_at = retrieved_at
        source_registry.register_source(source)

        return IngestionResult(
            success=True,
            source_id=source.source_id,
            document_id=document_id,
            checksum=checksum,
            total_sections=len(parsed_sections),
            chunks_generated=len(chunks),
            chunk_ids=[c.chunk_id for c in chunks],
            is_duplicate=False
        )

    async def ingest_from_url(
        self,
        source: LegalSourceMetadata,
        validate_authority: bool = True
    ) -> IngestionResult:
        """
        Download and ingest an authoritative legal document from an official URL.
        """
        download_res = await document_downloader.download_source_document(
            source.source_url,
            validate_authority=validate_authority
        )

        if not download_res.success:
            return IngestionResult(
                success=False,
                source_id=source.source_id,
                error=download_res.error
            )

        return self.ingest_document_bytes(
            source=source,
            raw_bytes=download_res.content_bytes,
            content_type=download_res.content_type
        )

ingestion_pipeline = SourceIngestionPipeline()
