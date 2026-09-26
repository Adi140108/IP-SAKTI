import logging
from typing import List, Dict, Any
from app.rag.source_registry import source_registry, LegalSourceMetadata
from app.rag.evidence import EvidenceChunk
from app.rag.embeddings import embeddings_provider

logger = logging.getLogger("IP-SAKTI.SourceIngestion")

class SourceIngestionPipeline:
    """
    Legal-aware Document Ingestion & Chunking Pipeline.
    Processes official source documents, attaches full version metadata, and indexes into VectorStore.
    """

    def process_and_chunk_source(self, source: LegalSourceMetadata, raw_text_sections: List[Dict[str, Any]]) -> List[EvidenceChunk]:
        """Process legal source sections into metadata-rich EvidenceChunks."""
        chunks = []
        for idx, sec in enumerate(raw_text_sections):
            chunk_id = f"CHK_{source.source_id}_{idx+1}"
            section_title = sec.get("section", "") or sec.get("article", "") or f"Provision {idx+1}"
            content_text = sec.get("content", "").strip()

            chunk = EvidenceChunk(
                chunk_id=chunk_id,
                source_id=source.source_id,
                title=source.title,
                authority=source.authority,
                jurisdiction=source.jurisdiction,
                section=sec.get("section", ""),
                article=sec.get("article", ""),
                effective_date=source.effective_date,
                version=source.version,
                retrieved_at=source.retrieved_at,
                source_url=source.source_url,
                text=content_text,
                relevance_score=0.0
            )
            chunks.append(chunk)

        logger.info(f"Ingested {len(chunks)} legal chunks for source '{source.title}'")
        return chunks

ingestion_pipeline = SourceIngestionPipeline()
