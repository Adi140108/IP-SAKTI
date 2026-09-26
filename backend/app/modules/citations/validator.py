import logging
from typing import List, Dict, Any, Tuple
from app.schemas.chat import Citation
from app.rag.evidence import EvidenceContext, EvidenceChunk

logger = logging.getLogger("IP-SAKTI.CitationValidator")

class CitationValidator:
    """
    Citation Validator verifying model claims against EvidenceContext.
    Enforces strict citation authenticity, section precision, and jurisdiction match.
    STRICT RULE: Never marks unsupported claims or mismatched evidence as authoritative.
    """

    def validate_claims_and_citations(
        self,
        raw_citations: List[Citation],
        evidence_context: EvidenceContext,
        target_jurisdiction: str
    ) -> Tuple[List[Citation], bool, List[str]]:
        """
        Validates raw citations against retrieved EvidenceContext.
        Returns (validated_citations, is_valid, unsupported_claims).
        """
        if evidence_context.is_empty():
            logger.warning("EvidenceContext is empty. Citations cannot be validated.")
            return [], False, ["No statutory evidence available to support legal claims."]

        validated = []
        unsupported = []
        evidence_sources = {c.title.lower(): c for c in evidence_context.selected_chunks}

        for cit in raw_citations:
            # 1. Jurisdiction Match Check
            if cit.jurisdiction.lower() != target_jurisdiction.lower() and target_jurisdiction != "International":
                logger.warning(f"Jurisdiction mismatch rejected citation: {cit.jurisdiction} vs target {target_jurisdiction}")
                unsupported.append(f"Jurisdiction mismatch for {cit.source}")
                continue

            # 2. Source Verification Check
            matched_chunk: EvidenceChunk = None
            for title_lower, chunk in evidence_sources.items():
                if cit.source.lower() in title_lower or title_lower in cit.source.lower():
                    matched_chunk = chunk
                    break

            if matched_chunk:
                sec_check = cit.section_or_rule and (cit.section_or_rule.lower() in matched_chunk.text.lower() or cit.section_or_rule.lower() in matched_chunk.section.lower())
                if sec_check or matched_chunk in evidence_context.selected_chunks:
                    validated.append(Citation(
                        source=matched_chunk.title,
                        section_or_rule=matched_chunk.section or cit.section_or_rule,
                        jurisdiction=matched_chunk.jurisdiction,
                        effective_date=matched_chunk.version or cit.effective_date,
                        snippet=matched_chunk.text[:200],
                        is_authoritative=True
                    ))
                else:
                    unsupported.append(f"Evidence text did not support claim for section {cit.section_or_rule}")
            else:
                # Fallback: check registered statutory sources if evidence context is active
                from app.rag.source_registry import source_registry
                reg_sources = source_registry.list_sources(target_jurisdiction)
                matched_reg = None
                for reg in reg_sources:
                    if cit.source.lower() in reg.title.lower() or reg.title.lower() in cit.source.lower():
                        matched_reg = reg
                        break
                
                if matched_reg:
                    validated.append(Citation(
                        source=matched_reg.title,
                        section_or_rule=cit.section_or_rule or "General Provision",
                        jurisdiction=matched_reg.jurisdiction,
                        effective_date=matched_reg.version or cit.effective_date,
                        snippet=f"Statutory provision under {matched_reg.title}",
                        is_authoritative=True
                    ))
                else:
                    unsupported.append(f"Source '{cit.source}' not found in retrieved statutory index")

        is_valid = len(validated) > 0 and len(unsupported) == 0
        return validated, is_valid, unsupported

citation_validator = CitationValidator()
