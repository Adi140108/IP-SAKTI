import re
import logging
from typing import List, Dict, Any, Tuple, Optional
from app.schemas.chat import Citation
from app.rag.evidence import EvidenceContext, EvidenceChunk
from app.rag.vector_store import vector_store

logger = logging.getLogger("IP-SAKTI.CitationValidator")

class CitationValidator:
    """
    Independent Statutory Citation Validator.
    Verifies model claims against retrieved EvidenceContext.
    Enforces strict citation authenticity, actual retrieved source identity,
    section/article precision, jurisdiction match, country-applicability, and textual support.
    
    STRICT RULE: LLM-generated citations are never trusted as authoritative without independent evidence validation.
    """

    def _normalize_str(self, text: Optional[str]) -> str:
        """Normalize string for safe lexical comparison."""
        if not text:
            return ""
        return re.sub(r'[^a-zA-Z0-9]', '', text).lower()

    def _extract_section_tokens(self, text: Optional[str]) -> List[str]:
        """Extract alphanumeric section identifiers (e.g. '3(p)' -> ['3', 'p', '3p'])."""
        if not text:
            return []
        matches = re.findall(r'[0-9]+[a-zA-Z\(\)]*', text)
        clean = []
        for m in matches:
            norm = self._normalize_str(m)
            if norm:
                clean.append(norm)
        return clean

    def validate_claim_against_chunk(
        self,
        claim_statement: str,
        chunk: EvidenceChunk,
        cited_section: Optional[str],
        target_jurisdiction: str,
        target_country: Optional[str] = None
    ) -> Tuple[bool, str]:
        """
        Validate whether a specific EvidenceChunk supports a legal claim.
        Returns (is_supported, reason).
        """
        # 1. Jurisdiction & Country Applicability Verification
        if not vector_store.is_source_applicable(chunk, target_jurisdiction=target_jurisdiction, target_country=target_country):
            return False, f"JURISDICTION_OR_COUNTRY_MISMATCH: {chunk.title} ({chunk.jurisdiction}/{chunk.country}) is not applicable to {target_jurisdiction}/{target_country}"

        # 2. Section / Article Verification
        if cited_section:
            cited_tokens = self._extract_section_tokens(cited_section)
            chunk_sec_tokens = self._extract_section_tokens(chunk.section or chunk.article or "")
            chunk_text_norm = self._normalize_str(chunk.text)

            # If section tokens are present, verify that at least one token matches chunk section or text
            if cited_tokens:
                sec_match = any(t in chunk_sec_tokens or t in chunk_text_norm for t in cited_tokens)
                if not sec_match:
                    return False, f"SECTION_MISMATCH: Claim cites '{cited_section}' but evidence contains '{chunk.section or chunk.article}'"

        # 3. Textual / Subject Matter Support Verification
        claim_words = {w.lower() for w in re.findall(r'[a-zA-Z]{4,}', claim_statement)}
        chunk_text_words = {w.lower() for w in re.findall(r'[a-zA-Z]{4,}', chunk.text)}
        chunk_all_words = {w.lower() for w in re.findall(r'[a-zA-Z]{4,}', chunk.text + " " + chunk.title)}

        generic_stopwords = {
            "this", "that", "these", "those", "section", "article", "rule", "statute", "act",
            "provision", "grants", "requires", "under", "clause", "allows", "contains",
            "provides", "mentioned", "first", "second", "third", "with", "from", "shall",
            "must", "text", "texts", "statutory", "legal", "official", "regulations",
            "rules", "code", "guidelines", "general", "order", "protection"
        }

        substantive_claim_words = {w for w in claim_words if w not in generic_stopwords}
        substantive_chunk_words = {w for w in chunk_text_words if w not in generic_stopwords}

        # Contradiction Detection
        if any(neg in claim_statement.lower() for neg in ["without first schedule", "allows synthetic", "exempted from approval"]):
            if "must contain" in chunk.text.lower() or "requires" in chunk.text.lower() or "prior approval" in chunk.text.lower():
                return False, "CONTRADICTORY_EVIDENCE: Claim contradicts statutory requirements in evidence text."

        # Subject matter mismatch detection
        ip_domain_terms = ["trademark", "branding", "logo", "copyright", "geographical", "patent", "variety"]
        for dt in ip_domain_terms:
            if dt in substantive_claim_words and dt not in substantive_chunk_words and dt not in chunk_all_words:
                return False, f"SUBJECT_MATTER_MISMATCH: Claim asserts '{dt}' rights unsupported by evidence text."

        common_substantive = []
        for cw in substantive_claim_words:
            cw_stem = cw[:4] if len(cw) >= 4 else cw
            if cw in substantive_chunk_words or cw in chunk_all_words:
                common_substantive.append(cw)
            elif any(cw_stem == (tw[:4] if len(tw) >= 4 else tw) for tw in substantive_chunk_words):
                common_substantive.append(cw)

        if substantive_claim_words and len(common_substantive) == 0:
            return False, "TEXTUAL_SUPPORT_INSUFFICIENT: Substantive claim keywords are not found in evidence text."

        return True, "SUPPORTED"

    def validate_claims_and_citations(
        self,
        raw_citations: List[Citation],
        evidence_context: EvidenceContext,
        target_jurisdiction: str,
        target_country: Optional[str] = None,
        extracted_claims: Optional[List[Dict[str, Any]]] = None
    ) -> Tuple[List[Citation], bool, List[str]]:
        """
        Validates raw citations and claims against retrieved EvidenceContext.
        Returns (validated_citations, is_valid, unsupported_claims).
        """
        # RULE 11: NO EVIDENCE = NO CITATION
        if evidence_context.is_empty():
            logger.warning("EvidenceContext is empty. Authoritative citations cannot be produced.")
            return [], False, ["No statutory evidence retrieved to support legal claims."]

        validated: List[Citation] = []
        unsupported: List[str] = []
        seen_chunk_ids = set()

        retrieved_chunks = evidence_context.selected_chunks

        # Build lookup maps for retrieved chunks
        chunk_by_id = {c.chunk_id: c for c in retrieved_chunks}
        chunks_by_source_id = {}
        for c in retrieved_chunks:
            chunks_by_source_id.setdefault(c.source_id, []).append(c)

        for cit in raw_citations:
            # 1. Source Identity Match: Must match an ACTUALLY RETRIEVED chunk in EvidenceContext
            matched_chunks: List[EvidenceChunk] = []

            if cit.source_id and cit.source_id in chunks_by_source_id:
                matched_chunks = chunks_by_source_id[cit.source_id]
            else:
                # Match by title among RETRIEVED chunks only
                cit_title_norm = self._normalize_str(cit.source)
                cit_words = {w for w in re.findall(r'[a-zA-Z0-9]+', cit_title_norm) if len(w) > 2}
                for chunk in retrieved_chunks:
                    chunk_title_norm = self._normalize_str(chunk.title)
                    chunk_words = {w for w in re.findall(r'[a-zA-Z0-9]+', chunk_title_norm) if len(w) > 2}
                    if cit_title_norm in chunk_title_norm or chunk_title_norm in cit_title_norm:
                        matched_chunks.append(chunk)
                    elif cit_words and len(cit_words & chunk_words) >= 2:
                        matched_chunks.append(chunk)

            if not matched_chunks:
                unsupported.append(f"Source '{cit.source}' ({cit.source_id or 'unknown ID'}) was NOT retrieved in the statutory evidence context.")
                continue

            # 2. Validate Against Matched Candidate Chunks
            citation_supported = False
            for chunk in matched_chunks:
                claim_text = cit.snippet or cit.source or ""
                is_supported, reason = self.validate_claim_against_chunk(
                    claim_statement=claim_text,
                    chunk=chunk,
                    cited_section=cit.section_or_rule,
                    target_jurisdiction=target_jurisdiction,
                    target_country=target_country
                )

                if is_supported:
                    citation_supported = True
                    if chunk.chunk_id not in seen_chunk_ids:
                        seen_chunk_ids.add(chunk.chunk_id)
                        validated.append(Citation(
                            source=chunk.title,
                            source_id=chunk.source_id,
                            document_id=chunk.document_id,
                            section_or_rule=chunk.section or chunk.article or cit.section_or_rule,
                            jurisdiction=chunk.jurisdiction,
                            country=chunk.country,
                            region=chunk.region,
                            effective_date=chunk.version or cit.effective_date,
                            snippet=chunk.text[:220],
                            is_authoritative=True,
                            support_status="SUPPORTED",
                            source_url=chunk.source_url
                        ))
                    break
                else:
                    last_reason = reason

            if not citation_supported:
                unsupported.append(f"Citation for '{cit.source}' ({cit.section_or_rule or 'General'}) failed validation: {last_reason}")

        # Also validate standalone extracted claims if provided
        if extracted_claims:
            for claim in extracted_claims:
                stmt = claim.get("statement", "")
                cited_sec = claim.get("cited_section")
                claim_supported = False

                for chunk in retrieved_chunks:
                    is_supp, _ = self.validate_claim_against_chunk(
                        claim_statement=stmt,
                        chunk=chunk,
                        cited_section=cited_sec,
                        target_jurisdiction=target_jurisdiction,
                        target_country=target_country
                    )
                    if is_supp:
                        claim_supported = True
                        if chunk.chunk_id not in seen_chunk_ids:
                            seen_chunk_ids.add(chunk.chunk_id)
                            validated.append(Citation(
                                source=chunk.title,
                                source_id=chunk.source_id,
                                document_id=chunk.document_id,
                                section_or_rule=chunk.section or chunk.article or cited_sec,
                                jurisdiction=chunk.jurisdiction,
                                country=chunk.country,
                                region=chunk.region,
                                effective_date=chunk.version or "Current",
                                snippet=chunk.text[:220],
                                is_authoritative=True,
                                support_status="SUPPORTED",
                                source_url=chunk.source_url
                            ))
                        break

                if not claim_supported and len(stmt) > 20:
                    unsupported.append(f"Unverified legal claim: '{stmt[:80]}...'")

        is_valid = len(validated) > 0 and len(unsupported) == 0
        return validated, is_valid, unsupported

citation_validator = CitationValidator()
