import logging
from typing import List
from app.rag.evidence import EvidenceChunk

logger = logging.getLogger("IP-SAKTI.Reranker")

class EvidenceReranker:
    """
    Reranks retrieved statutory EvidenceChunks based on authority level, version freshness, and section precision.
    """

    AUTHORITY_WEIGHTS = {
        "statutory": 0.4,
        "regulatory_guideline": 0.2,
        "public_pointer": 0.1
    }

    def rerank_evidence(self, chunks: List[EvidenceChunk], query: str) -> List[EvidenceChunk]:
        """Rerank chunks based on relevance score and statutory authority weight."""
        scored = []
        for chunk in chunks:
            # Look up authority level
            auth_weight = 0.3
            if "Act" in chunk.title or "Treaty" in chunk.title:
                auth_weight = 0.4
            elif "Regulation" in chunk.title:
                auth_weight = 0.3

            rerank_score = chunk.relevance_score + auth_weight
            scored.append((chunk, rerank_score))

        scored.sort(key=lambda x: x[1], reverse=True)
        return [item[0] for item in scored]

evidence_reranker = EvidenceReranker()
