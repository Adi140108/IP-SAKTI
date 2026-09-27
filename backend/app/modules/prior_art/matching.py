import re
import logging
from typing import List, Dict, Any, Optional, Set
from app.case.models import CaseState
from app.rag.vector_store import vector_store
from app.rag.reranker import evidence_reranker
from app.rag.evidence import EvidenceChunk
from app.modules.tkdl.service import tkdl_service
from app.modules.prior_art.models import PriorArtMatch, PriorArtSearchResult
from app.modules.prior_art.patent_database import find_matching_patents

logger = logging.getLogger("IP-SAKTI.PriorArtMatcher")

# Canonical synonym dictionary for botanical and Ayurvedic ingredients
BOTANICAL_SYNONYMS = {
    "ashwagandha": ["withania somnifera", "indian ginseng"],
    "turmeric": ["curcuma longa", "curcumin", "haridra"],
    "curcumin": ["curcuma longa", "turmeric", "haridra"],
    "brahmi": ["bacopa monnieri", "water hyssop"],
    "tulsi": ["ocimum sanctum", "holy basil"],
    "neem": ["azadirachta indica"],
    "amla": ["phyllanthus emblica", "emblica officinalis", "indian gooseberry"],
    "triphala": ["haritaki", "bibhitaki", "amalaki"],
    "guggulu": ["commiphora mukul", "guggul"],
    "shatavari": ["asparagus racemosus"],
    "giloy": ["tinospora cordifolia", "guduchi"],
    "ginger": ["zingiber officinale", "sunthi", "shunthi"],
    "black pepper": ["piper nigrum", "maricha", "piperine"],
    "piperine": ["piper nigrum", "black pepper", "bioenhancer"]
}

TECH_IMPROVEMENT_KEYWORDS = [
    "bioavailability", "stability", "extraction yield", "shelf life",
    "toxicity", "solubility", "dosage form", "processing time",
    "synergistic", "synergy", "absorption", "permeability",
    "sustained release", "nano-formulation", "lipid carrier",
    "phytosome", "liposome"
]

class PriorArtMatcher:
    """
    Deterministic Prior-Art and Existing-Patent Matching Engine.
    Queries the verified indexed statutory and prior-art corpus without fabricating
    patent numbers or creating unsubstantiated legal verdicts.
    """

    def build_prior_art_query(self, case_state: CaseState) -> str:
        """
        Builds a deterministic, normalized retrieval query from CaseState.
        Considers product type, normalized ingredients, composition, novelty,
        technical improvement, process, and jurisdiction.
        """
        query_parts: List[str] = []

        # 1. Normalized Ingredients & Botanical Synonyms
        normalized_ingredients: List[str] = []
        if case_state.ingredients:
            for ing in case_state.ingredients:
                clean_ing = ing.strip().lower()
                if clean_ing and clean_ing not in normalized_ingredients:
                    normalized_ingredients.append(clean_ing)
                    # Include primary botanical synonym if available
                    if clean_ing in BOTANICAL_SYNONYMS:
                        for syn in BOTANICAL_SYNONYMS[clean_ing]:
                            if syn not in normalized_ingredients:
                                normalized_ingredients.append(syn)
        
        if normalized_ingredients:
            query_parts.append(" ".join(normalized_ingredients[:6]))

        # 2. Formulation Type & Dosage Form
        form_terms: List[str] = []
        if case_state.product_type and case_state.product_type.lower() not in ["unknown", "none", ""]:
            form_terms.append(case_state.product_type.strip().lower())
        if case_state.dosage_or_form and case_state.dosage_or_form.lower() not in ["unknown", "none", ""]:
            form_terms.append(case_state.dosage_or_form.strip().lower())
        if form_terms:
            query_parts.append(" ".join(form_terms))

        # 3. Novelty Aspect (Filtered key phrases)
        if case_state.novelty_aspect and case_state.novelty_aspect.lower() not in ["unknown", "none", ""]:
            novelty_clean = re.sub(r'[^\w\s]', ' ', case_state.novelty_aspect.lower()).strip()
            # Extract high-value keywords (words >= 4 chars, max 6 words)
            novelty_words = [w for w in novelty_clean.split() if len(w) >= 4 and w not in ["this", "that", "with", "from", "have", "been", "using", "which"]][:6]
            if novelty_words:
                query_parts.append(" ".join(novelty_words))

        # 4. Technical Improvement
        if case_state.technical_improvement and case_state.technical_improvement.lower() not in ["unknown", "none", ""]:
            tech_clean = case_state.technical_improvement.lower()
            query_parts.append(tech_clean)

        # 5. Manufacturing Context / Process
        if case_state.manufacturing_context and case_state.manufacturing_context.lower() not in ["unknown", "none", ""]:
            mfg_clean = case_state.manufacturing_context.lower()
            query_parts.append(mfg_clean)

        # 6. Fallback if query parts are too brief
        if not query_parts:
            query_parts.append("Ayurvedic formulation patent prior art Section 3(p) Section 3(e)")

        deterministic_query = " ".join(query_parts).strip()
        logger.info(f"Built deterministic prior-art query: '{deterministic_query}'")
        return deterministic_query

    def _extract_matched_features(self, chunk: EvidenceChunk, case_state: CaseState) -> List[str]:
        """
        Determines which specific formulation features and concepts matched the retrieved record.
        Ensures explainability.
        """
        matched: List[str] = []
        chunk_text_lower = f"{chunk.title} {chunk.section} {chunk.text}".lower()

        # Check ingredients
        if case_state.ingredients:
            for ing in case_state.ingredients:
                ing_lower = ing.strip().lower()
                if ing_lower and ing_lower in chunk_text_lower:
                    matched.append(f"Ingredient: {ing.strip()}")
                elif ing_lower in BOTANICAL_SYNONYMS:
                    for syn in BOTANICAL_SYNONYMS[ing_lower]:
                        if syn in chunk_text_lower:
                            matched.append(f"Botanical Synonym: {syn} ({ing.strip()})")
                            break

        # Check technical improvements
        if case_state.technical_improvement:
            tech_lower = case_state.technical_improvement.lower()
            for kw in TECH_IMPROVEMENT_KEYWORDS:
                if kw in tech_lower and kw in chunk_text_lower:
                    matched.append(f"Technical Improvement: {kw}")

        # Check dosage/product type
        if case_state.product_type and case_state.product_type.lower() in chunk_text_lower:
            matched.append(f"Formulation Type: {case_state.product_type}")
        if case_state.dosage_or_form and case_state.dosage_or_form.lower() in chunk_text_lower:
            matched.append(f"Dosage Form: {case_state.dosage_or_form}")

        # Check statutory section overlap
        if "3(p)" in chunk_text_lower or "traditional knowledge" in chunk_text_lower:
            matched.append("Statutory Prior Art: Section 3(p) Traditional Knowledge Exclusion")
        if "3(e)" in chunk_text_lower or "synergistic" in chunk_text_lower or "admixture" in chunk_text_lower:
            matched.append("Statutory Efficacy: Section 3(e) Synergistic Effect Requirement")

        return list(dict.fromkeys(matched))

    def _categorize_match(self, score: float, matched_features: List[str], chunk: EvidenceChunk) -> str:
        """
        Assigns explainable retrieval category without making legal verdicts.
        """
        title_lower = chunk.title.lower()
        is_tk = "traditional knowledge" in title_lower or "tkdl" in title_lower or "pharmacopoeia" in title_lower or "samhita" in title_lower

        if is_tk:
            return "Related traditional knowledge"
        if score >= 0.75 and len(matched_features) >= 2:
            return "Strong potential prior-art relevance"
        if score >= 0.45 or len(matched_features) >= 1:
            return "Related formulation/technology"
        if score >= 0.25:
            return "Weak/partial similarity"
        return "No meaningful match"

    async def search_prior_art(self, case_state: CaseState, user_query: str = "", top_k: int = 4) -> PriorArtSearchResult:
        """
        Executes explainable prior-art and existing patent search across verified patent database,
        indexed vector store, and TKDL public classical pointers.
        """
        combined_ingredients = list(case_state.ingredients or [])
        if user_query:
            uq_lower = user_query.lower()
            for key, syns in BOTANICAL_SYNONYMS.items():
                if key in uq_lower or any(s in uq_lower for s in syns):
                    if key not in [i.lower() for i in combined_ingredients]:
                        combined_ingredients.append(key)

        query = self.build_prior_art_query(case_state)
        if user_query:
            query = f"{user_query} {query}".strip()

        effective_country = case_state.country or ("India" if case_state.jurisdiction == "India" else None)
        matches: List[PriorArtMatch] = []
        seen_titles = set()

        # 1. Primary: Search Verified Real-World Patent Database
        matched_patents = find_matching_patents(
            ingredients=combined_ingredients,
            product_type=case_state.product_type,
            novelty=case_state.novelty_aspect,
            technical_improvement=case_state.technical_improvement,
            query_text=query,
            top_k=top_k
        )

        for item in matched_patents:
            pat = item["patent"]
            score = item["score"]
            feats = item["matched_features"]

            # Category determination
            if score >= 0.65:
                category = "Strong potential prior-art relevance"
            elif "TKDL" in pat.get("patent_id", ""):
                category = "Related traditional knowledge"
            elif score >= 0.40:
                category = "Related formulation/technology"
            else:
                category = "Related technology / Adjacent patent"

            assignee_str = f" ({pat.get('assignee')})" if pat.get('assignee') else ""
            explanation = (
                f"**Claims Summary**: {pat.get('claims_summary', '')}\n\n"
                f"**Statutory Patentability Guidance**: {pat.get('section_3p_relevance', '')}"
            )

            p_match = PriorArtMatch(
                title=f"{pat.get('publication_number')}: {pat.get('title')}{assignee_str}",
                source_id=pat.get("patent_id"),
                source_type="patent_record" if "TKDL" not in pat.get("patent_id", "") else "tkdl_record",
                jurisdiction=pat.get("jurisdiction", "India"),
                country=pat.get("country", "India"),
                publication_number=pat.get("publication_number"),
                filing_date=pat.get("filing_date"),
                matched_features=feats,
                relevance_score=score,
                match_category=category,
                provenance=f"Official {pat.get('jurisdiction', 'India')} Patent Office / {pat.get('assignee', 'Verified Database')}",
                source_url=pat.get("source_url"),
                citation_metadata={
                    "assignee": pat.get("assignee"),
                    "therapeutic_area": pat.get("therapeutic_area"),
                    "technical_features": pat.get("technical_features", []),
                    "section_3p_relevance": pat.get("section_3p_relevance")
                },
                explanation=explanation,
                disclaimer="Potential match — not a legal determination."
            )
            matches.append(p_match)
            seen_titles.add(pat.get("title", "").lower())

        # 2. Secondary: Search vector store chunks if more results needed
        if len(matches) < top_k:
            raw_chunks: List[EvidenceChunk] = vector_store.search_chunks(
                query=query,
                jurisdiction=case_state.jurisdiction,
                country=effective_country,
                ip_domains=["patent", "tkdl", "statutory", "regulatory"],
                top_k=top_k
            )
            reranked_chunks: List[EvidenceChunk] = evidence_reranker.rerank_evidence(
                raw_chunks,
                query,
                target_country=effective_country,
                target_jurisdiction=case_state.jurisdiction
            )

            for chunk in reranked_chunks:
                if chunk.title.lower() in seen_titles:
                    continue
                matched_features = self._extract_matched_features(chunk, case_state)
                category = self._categorize_match(chunk.relevance_score, matched_features, chunk)
                src_type = "statutory_record"
                if "patent" in chunk.title.lower():
                    src_type = "patent_record"
                elif "tkdl" in chunk.title.lower() or "pharmacopoeia" in chunk.title.lower():
                    src_type = "tkdl_record"

                match = PriorArtMatch(
                    title=f"{chunk.title} — {chunk.section or 'General Provision'}",
                    source_id=chunk.source_id,
                    source_type=src_type,
                    jurisdiction=chunk.jurisdiction,
                    country=chunk.country,
                    publication_number=None,
                    filing_date=chunk.version if chunk.version and chunk.version != "Current" else None,
                    matched_features=matched_features,
                    relevance_score=round(chunk.relevance_score, 3),
                    match_category=category,
                    provenance="IP-SAKTI Statutory & Prior-Art Indexed Vector Corpus",
                    source_url=chunk.source_url,
                    citation_metadata={
                        "authority": chunk.authority,
                        "section": chunk.section,
                        "jurisdiction": chunk.jurisdiction,
                        "country": chunk.country
                    },
                    explanation=f"Matched features: {', '.join(matched_features) if matched_features else 'General statutory overlap'}.",
                    disclaimer="Potential match — not a legal determination."
                )
                matches.append(match)
                seen_titles.add(chunk.title.lower())
                if len(matches) >= top_k:
                    break

        # 3. Traditional Knowledge (TKDL) Pointer Retrieval
        tkdl_data = {}
        if case_state.traditional_knowledge_involved or case_state.ingredients:
            tkdl_data = tkdl_service.get_public_prior_art_pointers(
                formulation_type=case_state.product_type or "Ayurvedic formulation",
                ingredients=case_state.ingredients or []
            )

        # 4. Public Disclosure Warning Check
        disclosure_warning = None
        requires_escalation = False
        if case_state.public_disclosure:
            disclosure_warning = (
                "Public disclosure may be relevant to patent filing strategy. "
                "The assistant cannot determine the legal effect without jurisdiction-specific review."
            )
            requires_escalation = True

        if any(m.match_category == "Strong potential prior-art relevance" for m in matches):
            requires_escalation = True

        summary = (
            f"Found {len(matches)} matching real-world patent documents and TKDL prior art records in indexed database."
            if matches else "No sufficiently similar record was found in the currently indexed sources."
        )

        return PriorArtSearchResult(
            query_used=query,
            matches=matches,
            total_matches=len(matches),
            search_scope="Verified Patent Database & Indexed Statutory Corpus",
            tkdl_pointers=tkdl_data,
            summary_message=summary,
            public_disclosure_warning=disclosure_warning,
            requires_human_escalation=requires_escalation
        )

prior_art_matcher = PriorArtMatcher()

