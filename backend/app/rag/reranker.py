import logging
from typing import List, Optional
from app.rag.evidence import EvidenceChunk

logger = logging.getLogger("IP-SAKTI.Reranker")

class EvidenceReranker:
    """
    Reranks retrieved statutory EvidenceChunks based on authority level, version freshness, section precision,
    and target country relevance.
    """

    AUTHORITY_WEIGHTS = {
        "statutory": 0.4,
        "regulatory_guideline": 0.2,
        "public_pointer": 0.1
    }

    def rerank_evidence(
        self,
        chunks: List[EvidenceChunk],
        query: str,
        target_country: Optional[str] = None,
        target_jurisdiction: Optional[str] = None
    ) -> List[EvidenceChunk]:
        """Rerank chunks based on relevance score, statutory authority weight, and country applicability."""
        norm_country = (target_country or "").strip().lower() if target_country else None
        if norm_country in ["", "none", "null", "global", "unknown", "unspecified"]:
            norm_country = None

        scored = []
        for chunk in chunks:
            # Look up authority level
            auth_weight = 0.3
            if "Act" in chunk.title or "Treaty" in chunk.title or chunk.authority_level == "statutory":
                auth_weight = 0.4
            elif "Regulation" in chunk.title or chunk.authority_level == "regulatory_guideline":
                auth_weight = 0.3

            country_weight = 0.0
            if norm_country:
                chunk_country = (chunk.country or "").strip().lower() if chunk.country else None
                chunk_applicable = [c.lower() for c in (chunk.applicable_countries or [])]
                if chunk_country and chunk_country == norm_country:
                    country_weight = 0.3
                elif norm_country in chunk_applicable:
                    country_weight = 0.2
                elif (chunk.source_type or "").lower() == "treaty" or (chunk.region and chunk.region.lower() in ["international", "global"]):
                    country_weight = 0.2
                elif chunk_country and chunk_country != norm_country:
                    country_weight = -0.5

            rerank_score = chunk.relevance_score + auth_weight + country_weight
            scored.append((chunk, rerank_score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [item[0] for item in scored if item[1] > 0.0]

evidence_reranker = EvidenceReranker()
