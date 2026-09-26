import logging
from typing import List, Dict, Any, Tuple
from app.schemas.chat import Citation
from app.rag.evidence import EvidenceContext

logger = logging.getLogger("IP-SAKTI.ConfidenceEngine")

class EvidenceConfidenceEngine:
    """
    Calculates Evidence Confidence (NOT Legal Certainty) strictly from statutory evidence metrics.
    Triggers Safe Abstention when statutory evidence threshold (< 0.35) is unsatisfied.
    """

    def calculate_evidence_confidence(
        self,
        evidence_context: EvidenceContext,
        validated_citations: List[Citation],
        jurisdiction: str
    ) -> Tuple[float, str, str, bool]:
        """
        Calculates score (0.0 to 1.0), level ("high", "medium", "limited"), explanation, and safe_abstention flag.
        """
        if evidence_context.is_empty():
            return 0.1, "limited", "Safe Abstention: No verified statutory evidence found in legal index for this query.", True

        # 1. Retrieval Relevance Score Factor (0.0 - 0.3)
        relevance_factor = min(evidence_context.top_relevance_score * 0.4, 0.3)

        # 2. Citation Verification Status Factor (0.0 - 0.3)
        citation_factor = 0.3 if len(validated_citations) >= 1 else 0.1

        # 3. Source Count & Authority Weight (0.0 - 0.4)
        has_act = any("Act" in c.title or "Treaty" in c.title for c in evidence_context.selected_chunks)
        authority_factor = 0.4 if has_act and len(evidence_context.selected_chunks) >= 2 else 0.2

        total_score = round(relevance_factor + citation_factor + authority_factor, 2)

        # Determine level
        if total_score >= 0.7:
            level = "high"
        elif total_score >= 0.4:
            level = "medium"
        else:
            level = "limited"

        safe_abstention = total_score < 0.35

        if safe_abstention:
            explanation = (
                f"Safe Abstention: Statutory evidence for {jurisdiction} is below the high-confidence verification threshold. "
                "Consultation with a qualified IP attorney or AYUSH regulatory consultant is strongly advised."
            )
        else:
            explanation = (
                f"Evidence Confidence: {level.capitalize()} ({int(total_score * 100)}%). Answer verified against "
                f"{len(validated_citations)} statutory citations from {evidence_context.selected_chunks[0].title}."
            )

        return total_score, level, explanation, safe_abstention

confidence_engine = EvidenceConfidenceEngine()
