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
    Manages document lifecycle: download -> SHA-256 byte hashing -> validation -> multi-format parsing (HTML, PDF, Text, MD) -> legal-aware chunking.
    """

    @staticmethod
    def compute_checksum(data: bytes) -> str:
        """Calculate cryptographic SHA-256 hash strictly from actual document bytes."""
        if not isinstance(data, (bytes, bytearray)):
            raise TypeError("Checksum calculation requires raw bytes.")
        return hashlib.sha256(data).hexdigest()

    def parse_pdf_bytes(self, raw_bytes: bytes) -> List[Dict[str, Any]]:
        """
        Extract text from PDF page-by-page using pypdf or pymupdf, preserving page numbers and section headers.
        If PDF is scanned or yields no extractable text, returns OCR_REQUIRED marker.
        """
        pages_content = []
        
        # Try pypdf first
        try:
            import io
            import pypdf
            reader = pypdf.PdfReader(io.BytesIO(raw_bytes))
            for page_idx, page in enumerate(reader.pages):
                page_text = page.extract_text() or ""
                cleaned = page_text.strip()
                if cleaned:
                    pages_content.append({
                        "page_number": page_idx + 1,
                        "text": cleaned
                    })
        except Exception as e:
            logger.debug(f"pypdf extraction failed, attempting pymupdf: {e}")
            try:
                import fitz
                doc = fitz.open(stream=raw_bytes, filetype="pdf")
                for page_idx, page in enumerate(doc):
                    page_text = page.get_text() or ""
                    cleaned = page_text.strip()
                    if cleaned:
                        pages_content.append({
                            "page_number": page_idx + 1,
                            "text": cleaned
                        })
            except Exception as e2:
                logger.error(f"PDF extraction error: {e2}")

        if not pages_content:
            logger.warning("PDF contains no extractable text layer. OCR_REQUIRED.")
            return [{"ocr_required": True, "error": "OCR_REQUIRED: No machine-readable text found in PDF"}]

        # Perform legal-aware section extraction for each page
        sections = []
        for page_data in pages_content:
            p_num = page_data["page_number"]
            p_text = page_data["text"]
            parsed_page_secs = self._extract_legal_sections_from_text(p_text, page_number=p_num)
            sections.extend(parsed_page_secs)

        return sections

    def parse_html_bytes(self, raw_bytes: bytes) -> List[Dict[str, Any]]:
        """
        Parse HTML document, stripping scripts/styles/tags and extracting structured legal sections.
        Uses BeautifulSoup if available, or standard library HTML parsing as fallback.
        """
        try:
            html_str = raw_bytes.decode("utf-8")
        except UnicodeDecodeError:
            html_str = raw_bytes.decode("latin-1", errors="replace")

        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html_str, "html.parser")
            for tag in soup(["script", "style", "nav", "footer", "header", "noscript"]):
                tag.decompose()

            # Extract main content text or structured sections
            body = soup.body or soup
            text = body.get_text(separator="\n\n")
            return self._extract_legal_sections_from_text(text)
        except ImportError:
            # Fallback when bs4 is not installed: clean HTML using regex and paragraph markers
            clean_html = re.sub(r'<(script|style|nav|footer|header|noscript)[^>]*>.*?</\1>', '', html_str, flags=re.DOTALL | re.IGNORECASE)
            clean_html = re.sub(r'</(h[1-6]|p|div|li|tr)>', '\n\n', clean_html, flags=re.IGNORECASE)
            text = re.sub(r'<[^>]+>', ' ', clean_html)
            text = re.sub(r'[ \t]+', ' ', text)
            return self._extract_legal_sections_from_text(text)
        except Exception as e:
            logger.error(f"HTML parsing failed: {e}")
            clean_html = re.sub(r'<[^>]+>', ' ', html_str)
            return self._extract_legal_sections_from_text(clean_html)

    def _extract_legal_sections_from_text(self, text: str, page_number: Optional[int] = None) -> List[Dict[str, Any]]:
        """
        Legal-aware statutory chunking engine:
        Hierarchically recognizes Act -> Chapter -> Section -> Subsection -> Rule -> Article -> Schedule.
        """
        cleaned_text = text.strip()
        if not cleaned_text:
            return []

        sections = []

        # Comprehensive statutory header pattern matching:
        # e.g., "Section 3(p)", "Sec. 2(1)(e)", "Article 15", "Rule 14", "Chapter II", "Schedule A"
        pattern = re.compile(
            r'(?:^|\n)\s*(?P<header>(?:Section|Sec\.|Article|Art\.|Rule|Monograph|Chapter|Schedule)\s+[0-9a-zA-Z\(\)\.\s\-]+?)(?:\:|\n|\s{2,})',
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
                    entry = {
                        sec_type: header,
                        "content": f"{header}: {body}" if not body.startswith(header) else body
                    }
                    if page_number is not None:
                        entry["page_number"] = page_number
                    sections.append(entry)
        elif "\n\n" in cleaned_text:
            paragraphs = [p.strip() for p in cleaned_text.split("\n\n") if len(p.strip()) > 20]
            for idx, p in enumerate(paragraphs):
                entry = {
                    "section": f"Paragraph {idx + 1}",
                    "content": p
                }
                if page_number is not None:
                    entry["page_number"] = page_number
                sections.append(entry)
        else:
            if len(cleaned_text) > 10:
                entry = {
                    "section": "General Provision",
                    "content": cleaned_text
                }
                if page_number is not None:
                    entry["page_number"] = page_number
                sections.append(entry)

        return sections

    def parse_document_text(self, raw_bytes: bytes, content_type: str = "text/plain") -> List[Dict[str, Any]]:
        """
        Parse raw document bytes into structured statutory sections based on content-type.
        Supports HTML, PDF, Markdown, and plain text.
        """
        if not raw_bytes or len(raw_bytes.strip()) == 0:
            return []

        c_type = (content_type or "text/plain").lower()
        if "pdf" in c_type or raw_bytes.startswith(b"%PDF"):
            return self.parse_pdf_bytes(raw_bytes)
        elif "html" in c_type or b"<html" in raw_bytes[:500].lower() or b"<!doctype html" in raw_bytes[:500].lower():
            return self.parse_html_bytes(raw_bytes)
        else:
            # Plain text / Markdown
            try:
                text = raw_bytes.decode("utf-8")
            except UnicodeDecodeError:
                text = raw_bytes.decode("latin-1", errors="replace")
            return self._extract_legal_sections_from_text(text)

    def process_and_chunk_source(
        self,
        source: LegalSourceMetadata,
        raw_text_sections: List[Dict[str, Any]],
        document_id: Optional[str] = None,
        checksum: Optional[str] = None
    ) -> List[EvidenceChunk]:
        """
        Process legal source sections into metadata-rich EvidenceChunks,
        attaching complete document provenance, page numbers, and byte checksum.
        """
        chunks = []
        actual_checksum = checksum or source.checksum
        doc_id = document_id or f"DOC_{source.source_id}"

        for idx, sec in enumerate(raw_text_sections):
            if sec.get("ocr_required"):
                continue

            chunk_id = f"CHK_{source.source_id}_{idx+1}"
            section_val = sec.get("section", "")
            article_val = sec.get("article", "")
            page_num_val = sec.get("page_number")
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
                page_number=page_num_val,
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
