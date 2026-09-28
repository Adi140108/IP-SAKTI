import logging
import uuid
from datetime import datetime
from typing import Dict, Any, List, Optional
from app.case.models import CaseState
from app.schemas.chat import ComparisonRequest, ComparisonResponse, ComparisonDimension, Citation
from app.rag.retriever import rag_retriever
from app.rag.evidence import EvidenceContext
from app.modules.citations.claim_extractor import claim_extractor
from app.modules.citations.validator import citation_validator
from app.modules.confidence.engine import confidence_engine
from app.ai.groq.provider import groq_provider
from app.ai.bhashini.service import bhashini_service

logger = logging.getLogger("IP-SAKTI.ComparativeLawEngine")

AVAILABLE_COMPARISON_TARGETS = [
    "International Standards (WIPO PCT, Nagoya Protocol, TRIPS)",
    "United States (USPTO - 35 U.S.C.)",
    "European Union (EPO - European Patent Convention)",
    "Germany (DPMA - German Patent Act PatG)",
    "United Kingdom (UK IPO - Patents Act 1977)",
    "Japan (JPO - Japan Patent Act)",
    "Australia (IP Australia - Patents Act 1990)",
    "China (CNIPA - Chinese Patent Law)",
    "Canada (CIPO - Patent Act)",
    "Singapore (IPOS - Patents Act)",
    "Brazil (INPI - Industrial Property Law)"
]

COUNTRY_NORMALIZATION_MAP = {
    "us": "USA",
    "usa": "USA",
    "united states": "USA",
    "america": "USA",
    "uspto": "USA",
    "eu": "European Union",
    "europe": "European Union",
    "european union": "European Union",
    "epo": "European Union",
    "epc": "European Union",
    "germany": "Germany",
    "deutschland": "Germany",
    "dpma": "Germany",
    "patg": "Germany",
    "uk": "United Kingdom",
    "united kingdom": "United Kingdom",
    "britain": "United Kingdom",
    "ukipo": "United Kingdom",
    "japan": "Japan",
    "jpo": "Japan",
    "australia": "Australia",
    "ip australia": "Australia",
    "china": "China",
    "cnipa": "China",
    "prc": "China",
    "canada": "Canada",
    "cipo": "Canada",
    "singapore": "Singapore",
    "ipos": "Singapore",
    "brazil": "Brazil",
    "inpi": "Brazil",
    "international": "International",
    "global": "International",
    "wipo": "International",
    "pct": "International",
    "nagoya": "International",
    "trips": "International",
    "cbd": "International"
}

LANGUAGE_NAMES = {
    "en": "English",
    "hi": "Hindi (हिंदी)",
    "ta": "Tamil (தமிழ்)",
    "te": "Telugu (తెలుగు)",
    "mr": "Marathi (मराठी)",
    "bn": "Bengali (বাংলা)",
    "gu": "Gujarati (ગુજરાતી)",
    "kn": "Kannada (ಕನ್ನಡ)",
    "ml": "Malayalam (മലയാളം)",
}

async def robust_translate(text: str, source_lang: str, target_lang: str) -> str:
    """Translates text with Bhashini NMT prioritized, falling back to Groq."""
    if not text or not text.strip() or source_lang == target_lang:
        return text
    target_name = LANGUAGE_NAMES.get(target_lang, target_lang)
    if bhashini_service.is_configured():
        try:
            translated = await bhashini_service.translate_text(text, source_lang=source_lang, target_lang=target_lang)
            if translated and translated.strip():
                return translated
        except Exception as e:
            logger.warning(f"Bhashini NMT translation ({source_lang} -> {target_lang}) failed: {e}")

    try:
        prompt = (
            f"You are an expert statutory legal translator for Intellectual Property law.\n"
            f"Translate the following text accurately and idiomatically from {source_lang} into {target_name} ({target_lang}).\n"
            f"STRICT RULES:\n"
            f"- Retain exact section numbers, Act citations (e.g. Section 3(p), 35 U.S.C. 101, EPC Art 52), table structures, and bullet point formatting.\n"
            f"- Do NOT add conversational fluff. Output ONLY the translated text.\n\n"
            f"{text}"
        )
        translated = await groq_provider.generate_text(prompt)
        if translated and translated.strip():
            return translated.strip()
    except Exception as e:
        logger.error(f"Groq translation fallback failed: {e}")
    return text


class ComparativeLawEngine:
    """
    Statutory Comparative Law Engine.
    Performs dual-jurisdiction RAG retrieval (India vs. International / Foreign Country),
    synthesizes side-by-side legal dimensions, highlights key differences in patentability,
    traditional knowledge, and ABS compliance, and outlines cross-border filing pathways.
    """

    def normalize_target_country(self, raw_target: Optional[str]) -> Dict[str, str]:
        if not raw_target:
            return {"jurisdiction": "International", "country": "Global", "display": "International Standards (WIPO / PCT / Nagoya)"}

        clean = raw_target.lower().strip()
        for key, val in COUNTRY_NORMALIZATION_MAP.items():
            if key in clean:
                if val == "International":
                    return {"jurisdiction": "International", "country": "Global", "display": "International Treaties & Standards (WIPO/PCT/Nagoya)"}
                return {"jurisdiction": "International", "country": val, "display": val}

        # Fallback to cleaned title case
        display_name = raw_target.strip().title()
        return {"jurisdiction": "International", "country": display_name, "display": display_name}

    async def compare_jurisdictions(self, request: ComparisonRequest, case_state: CaseState) -> ComparisonResponse:
        norm = self.normalize_target_country(request.target_country)
        target_country = norm["country"]
        target_display = norm["display"]
        lang = request.language or "en"
        query_text = request.user_query or (
            f"Comparison of patentability, Traditional Knowledge prior art, and ABS requirements "
            f"for formulation '{case_state.product_name or case_state.formulation_classification}' "
            f"with active ingredients {', '.join(case_state.ingredients) if case_state.ingredients else 'Ayurvedic herbal extract'}."
        )

        logger.info(f"Running comparative legal analysis: India vs {target_display} (Target Country: {target_country})")

        # 1. Dual RAG Retrieval (India vs Target International/Foreign)
        india_evidence_task = rag_retriever.retrieve_evidence(
            query=query_text,
            jurisdiction="India",
            country="India",
            ip_domains=case_state.intellectual_property_objective or ["patent", "abs", "tkdl_prior_art"],
            top_k=4
        )

        target_evidence_task = rag_retriever.retrieve_evidence(
            query=query_text,
            jurisdiction="International",
            country=target_country if target_country != "Global" else None,
            ip_domains=case_state.intellectual_property_objective or ["patent", "abs", "tkdl_prior_art"],
            top_k=4
        )

        import asyncio
        india_evidence, target_evidence = await asyncio.gather(india_evidence_task, target_evidence_task)

        # Combine selected evidence chunks for citation checking
        all_chunks = india_evidence.selected_chunks + target_evidence.selected_chunks
        combined_evidence = EvidenceContext(
            selected_chunks=all_chunks,
            source_metadata=india_evidence.source_metadata + target_evidence.source_metadata,
            top_relevance_score=max(india_evidence.top_relevance_score, target_evidence.top_relevance_score),
            authority_level="statutory",
            jurisdiction="Comparative",
            version="Current"
        )

        # 2. LLM Synthesis of Structured Comparative Matrix
        system_prompt = (
            "You are an authoritative Senior International Patent Attorney and Comparative IP Law Expert "
            "specializing in Traditional Knowledge, Phytopharmaceuticals, and Botanical Formulations.\n"
            "Your task is to provide an exact, rigorous side-by-side comparative statutory analysis "
            f"between INDIAN IP LAW and {target_display} / International Legal Frameworks.\n\n"
            "STRICT LEGAL ACCURACY RULES:\n"
            "1. Base comparisons ONLY on real statutory principles and verified treaty standards.\n"
            "2. For India, explicitly reference Patents Act 1970 (Sec 3(p) TK bar, Sec 3(e) admixture bar, Sec 3(d) enhanced efficacy), "
            "Biological Diversity Act 2002 (Sec 3/6 NBA Form I/III prior approval), and TKDL.\n"
            f"3. For {target_display}, cite exact domestic statutes/treaties (e.g. 35 U.S.C. 101/102 for USA, EPC Art 52/54 & EU Reg 511/2014 for Europe, "
            "PatG §1/2a for Germany, PCT Art 15, Nagoya Protocol Art 5/6, TRIPS Art 27, WIPO GRTKF Treaty 2024).\n"
            "4. Clearly highlight differences in Subject Matter Eligibility, Prior Art Bar, and ABS / Origin Disclosure.\n"
            "5. Include Section 39 IPO Foreign Filing License requirements for Indian innovators filing abroad."
        )

        user_prompt = f"""
Case Context:
- Formulation Classification: {case_state.formulation_classification}
- Active Ingredients: {', '.join(case_state.ingredients) if case_state.ingredients else 'Herbal botanical extracts'}
- Classical Text Basis: {case_state.classical_reference or 'Unspecified'}
- Traditional Knowledge: {'Yes' if case_state.traditional_knowledge_involved else 'No / Unknown'}
- Biological Resources: {'Yes' if case_state.biological_resources_involved else 'No / Unknown'}
- Target Comparison: {target_display} ({target_country})

Indian Statutory Evidence:
{india_evidence.to_formatted_prompt_text()}

Target International / Foreign Statutory Evidence:
{target_evidence.to_formatted_prompt_text()}

User Query / Focus:
{query_text}

Task:
Produce a detailed, structured comparative assessment in JSON format with exactly the following schema:
{{
  "comparison_title": "Concise comparative header (e.g. Comparative IP Analysis: India vs. USA (USPTO))",
  "comparison_summary": "High-impact 2-3 sentence executive summary of the legal divergences.",
  "indian_law_position": "Summary of statutory stance under Indian law (Patents Act 1970 Sec 3(p)/3(e) & BDA 2002).",
  "target_law_position": "Summary of statutory stance under {target_display}.",
  "dimensions": [
    {{
      "dimension": "Patentability & Natural Products (Subject Matter Eligibility)",
      "india_law": "Explicit Indian statute and hurdle (e.g. Sec 3(p) TK bar, Sec 3(e) requires synergistic lab proof)",
      "target_law": "Explicit target country statute/test (e.g. 35 USC 101 Mayo/Myriad natural product doctrine, EPC Art 52(2))",
      "key_difference": "Crucial divergence between the two regimes",
      "strategic_implication": "Actionable patent prosecution tip for the innovator"
    }},
    {{
      "dimension": "Traditional Knowledge & Prior Art Examination",
      "india_law": "TKDL automatic citation under Section 3(p)",
      "target_law": "How target patent office searches TKDL / printed publications (e.g. 35 USC 102, PCT Art 15, EPC Art 54)",
      "key_difference": "Crucial divergence in prior art evaluation",
      "strategic_implication": "Evidence needed to establish novelty"
    }},
    {{
      "dimension": "Access & Benefit Sharing (ABS) & Disclosure of Origin",
      "india_law": "Mandatory NBA Form I / Form III approval under BDA 2002 Sec 6 prior to patent grant",
      "target_law": "Nagoya Protocol / domestic origin disclosure (e.g. EU Reg 511/2014, WIPO 2024 Treaty, US rules)",
      "key_difference": "Different regulatory compliance steps and criminal/financial penalties",
      "strategic_implication": "Permits and agreements required before commercialization"
    }},
    {{
      "dimension": "Filing Timeline & Statutory Prerequisites",
      "india_law": "Section 39 Patents Act foreign filing license (FFL) requirement if first filing abroad",
      "target_law": "PCT 30/31-month national phase entry or 12-month Paris Convention priority window",
      "key_difference": "Mandatory procedural sequence",
      "strategic_implication": "Recommended chronological filing roadmap"
    }}
  ],
  "filing_pathway_advice": "Step-by-step cross-border strategy for an Indian applicant expanding into {target_display}.",
  "citations": [
    {{
      "source": "Exact Title of Statute or Treaty",
      "section_or_rule": "Section/Article number",
      "jurisdiction": "India or International",
      "effective_date": "Year/Date"
    }}
  ]
}}
"""

        raw_cits = []
        comp_title = f"Comparative Legal Analysis: India vs {target_display}"
        comp_summary = ""
        in_pos = ""
        tg_pos = ""
        dims = []
        pathway_advice = ""

        try:
            groq_res = await groq_provider.generate_structured_json(user_prompt, system_prompt)
            comp_title = groq_res.get("comparison_title", comp_title)
            comp_summary = groq_res.get("comparison_summary", "")
            in_pos = groq_res.get("indian_law_position", "")
            tg_pos = groq_res.get("target_law_position", "")
            pathway_advice = groq_res.get("filing_pathway_advice", "")

            raw_dims = groq_res.get("dimensions", [])
            for d in raw_dims:
                dims.append(ComparisonDimension(
                    dimension=d.get("dimension", "Key Legal Dimension"),
                    india_law=d.get("india_law", ""),
                    target_law=d.get("target_law", ""),
                    key_difference=d.get("key_difference", ""),
                    strategic_implication=d.get("strategic_implication", "")
                ))

            for c in groq_res.get("citations", []):
                raw_cits.append(Citation(
                    source=c.get("source", "Statutory Source"),
                    section_or_rule=c.get("section_or_rule"),
                    jurisdiction=c.get("jurisdiction", "Comparative"),
                    effective_date=c.get("effective_date"),
                    is_authoritative=True
                ))
        except Exception as e:
            logger.warning(f"Groq comparative analysis generation error: {e}. Assembling deterministic fallback.")

        # Deterministic fallback if generation is empty
        if not dims:
            dims = [
                ComparisonDimension(
                    dimension="Patentability & Natural Products (Subject Matter Eligibility)",
                    india_law="Section 3(p) excludes Traditional Knowledge; Section 3(e) excludes mere admixtures without synergistic proof.",
                    target_law=f"Under {target_display}, natural extracts require technical transformation/isolation (e.g. 35 U.S.C. 101 or EPC Art 52).",
                    key_difference="India has a statutory TK bar (3(p)) and admixture bar (3(e)); foreign jurisdictions evaluate via subject matter eligibility and inventive step.",
                    strategic_implication="Generate comparative pharmacological bioassay data demonstrating non-obvious synergistic efficacy."
                ),
                ComparisonDimension(
                    dimension="Traditional Knowledge & Prior Art",
                    india_law="TKDL classical texts are actively searched by IPO examiners as statutory prior art under Section 3(p).",
                    target_law="Examiners search worldwide prior art, including TKDL access agreements under PCT Article 15.",
                    key_difference="TKDL citations are decisive in India; foreign offices assess whether the specific formulation was publicly disclosed.",
                    strategic_implication="Conduct prior art clearance against classical Ayurvedic treatises (Charaka, Sushruta, Vagbhata)."
                ),
                ComparisonDimension(
                    dimension="Access & Benefit Sharing (ABS) & Disclosure of Origin",
                    india_law="Mandatory prior approval from National Biodiversity Authority (NBA Form I/Form III) under Section 6 of Biological Diversity Act 2002.",
                    target_law=f"Nagoya Protocol compliance (Articles 5/6) and mandatory origin disclosure under WIPO 2024 Treaty.",
                    key_difference="India imposes strict criminal/financial penalties for failure to obtain prior NBA approval before patent filing.",
                    strategic_implication="File NBA Form III intimation before obtaining international patent grant."
                ),
                ComparisonDimension(
                    dimension="Cross-Border Filing Prerequisites",
                    india_law="Section 39 Patents Act 1970 requires Foreign Filing License (FFL) or 6-week waiting period if first filed abroad.",
                    target_law=f"File PCT international application within 12 months (Paris Convention) with 30/31-month national phase entry into {target_display}.",
                    key_difference="Failure to obtain Section 39 permission in India can invalidate patent rights and lead to penal liabilities.",
                    strategic_implication="File initial provisional patent application in India, obtain Section 39 FFL, then enter PCT."
                )
            ]
            comp_summary = (
                f"While Indian law strictly bars traditional formulations under Section 3(p) and Section 3(e) of the Patents Act 1970 "
                f"and requires mandatory NBA ABS clearance, {target_display} evaluates patentability based on isolation/modification, "
                f"inventive step, and Nagoya Protocol compliance."
            )
            in_pos = "India Patent Act 1970 (Sec 3(p), 3(e), 3(d)) + Biological Diversity Act 2002 (Sec 3, 6, 19)."
            tg_pos = f"Target {target_display} statutory patent and biodiversity frameworks."
            pathway_advice = (
                "1. File Indian Provisional Application first -> 2. Obtain Section 39 FFL -> 3. File PCT Application within 12 months -> "
                "4. Obtain NBA Form III Approval -> 5. Enter National Phase in target countries within 30/31 months."
            )

        # 3. Assemble Authoritative Statutory Citations from retrieved RAG context
        validated_cits = []
        seen_chunk_ids = set()
        for chunk in combined_evidence.selected_chunks:
            if chunk.chunk_id not in seen_chunk_ids:
                seen_chunk_ids.add(chunk.chunk_id)
                validated_cits.append(Citation(
                    source=chunk.title,
                    source_id=chunk.source_id,
                    document_id=chunk.document_id,
                    section_or_rule=chunk.section or chunk.article or "General Provision",
                    jurisdiction=chunk.jurisdiction,
                    country=chunk.country,
                    region=chunk.region,
                    effective_date=chunk.version or "Current",
                    snippet=chunk.text[:220],
                    is_authoritative=True,
                    support_status="SUPPORTED",
                    source_url=chunk.source_url
                ))

        conf_score, conf_level, conf_exp, _ = confidence_engine.calculate_evidence_confidence(
            evidence_context=combined_evidence,
            validated_citations=validated_cits,
            jurisdiction="International"
        )


        # 5. Multilingual translation if required
        if lang != "en":
            try:
                comp_title = await robust_translate(comp_title, "en", lang)
                comp_summary = await robust_translate(comp_summary, "en", lang)
                in_pos = await robust_translate(in_pos, "en", lang)
                tg_pos = await robust_translate(tg_pos, "en", lang)
                pathway_advice = await robust_translate(pathway_advice, "en", lang)
                for d in dims:
                    d.dimension = await robust_translate(d.dimension, "en", lang)
                    d.india_law = await robust_translate(d.india_law, "en", lang)
                    d.target_law = await robust_translate(d.target_law, "en", lang)
                    d.key_difference = await robust_translate(d.key_difference, "en", lang)
                    d.strategic_implication = await robust_translate(d.strategic_implication, "en", lang)
            except Exception as e:
                logger.error(f"Translation of comparative matrix failed: {e}")

        return ComparisonResponse(
            case_id=request.case_id,
            target_jurisdiction="International",
            target_country=target_country,
            comparison_title=comp_title,
            comparison_summary=comp_summary,
            indian_law_position=in_pos,
            target_law_position=tg_pos,
            dimensions=dims,
            filing_pathway_advice=pathway_advice,
            citations=validated_cits,
            confidence_score=conf_score,
            confidence_explanation=conf_exp,
            available_countries=AVAILABLE_COMPARISON_TARGETS
        )

comparative_law_engine = ComparativeLawEngine()
