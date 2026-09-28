import uuid
import asyncio
import logging
from datetime import datetime
from typing import Dict, Any, Optional
from app.schemas.chat import ChatRequest, ChatResponse, Citation
from app.case.models import CaseState
from app.case.state_manager import case_state_manager
from app.db.firestore import firestore_service
from app.ai.groq.provider import groq_provider
from app.ai.bhashini.service import bhashini_service
from app.orchestration.case_orchestrator import case_orchestrator
from app.modules.classification.engine import classification_engine
from app.modules.ip_router.engine import ip_router
from app.modules.jurisdiction.engine import jurisdiction_engine
from app.rag.retriever import rag_retriever
from app.rag.evidence import EvidenceContext
from app.modules.citations.claim_extractor import claim_extractor
from app.modules.citations.validator import citation_validator
from app.modules.confidence.engine import confidence_engine
from app.modules.questioning.engine import questioning_engine
from app.modules.prior_art.matching import prior_art_matcher
from app.modules.comparison.engine import comparative_law_engine, ComparisonRequest, AVAILABLE_COMPARISON_TARGETS


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

logger = logging.getLogger("IP-SAKTI.ConversationPipeline")

async def robust_translate(text: str, source_lang: str, target_lang: str) -> str:
    """
    Translates text with Bhashini NMT prioritized, seamlessly falling back
    to high-speed Groq neural Indic translation if Bhashini is unconfigured or unreachable.
    """
    if not text or not text.strip() or source_lang == target_lang:
        return text
    target_name = LANGUAGE_NAMES.get(target_lang, target_lang)
    
    # 1. Primary: Government of India Bhashini NMT
    if bhashini_service.is_configured():
        try:
            translated = await bhashini_service.translate_text(text, source_lang=source_lang, target_lang=target_lang)
            if translated and translated.strip():
                return translated
        except Exception as e:
            logger.warning(f"Bhashini NMT translation ({source_lang} -> {target_lang}) failed: {e}. Falling back to Groq neural translation.")
            
    # 2. Resilient Fallback: Groq Neural Multilingual Translation Engine
    try:
        translation_prompt = (
            f"You are an expert statutory legal translator for AYUSH and IP law in India.\n"
            f"Translate the following text accurately and idiomatically from {source_lang} into {target_name} ({target_lang}).\n"
            f"STRICT RULES:\n"
            f"- Use natural, authentic {target_name} script (e.g. Devanagari for Hindi/Marathi, Tamil script for Tamil, Telugu for Telugu, etc.).\n"
            f"- Retain exact section numbers, Act citations (e.g. Section 3(p), Patents Act 1970, Form I, BDA 2002), and bullet point structure.\n"
            f"- Do NOT add conversational fluff or meta-explanations. Output ONLY the translated text.\n\n"
            f"{text}"
        )
        translated = await groq_provider.generate_text(translation_prompt)
        if translated and translated.strip():
            return translated.strip()
    except Exception as e:
        logger.error(f"Groq translation fallback failed ({source_lang} -> {target_lang}): {e}")

    return text

class ConversationPipeline:
    """
    Decoupled Conversation Orchestrator.
    Coordinates the multi-stage AI reasoning, extraction, RAG retrieval, citation verification,
    and dynamic questioning workflow.
    """

    async def execute_conversation_turn(self, request: ChatRequest) -> ChatResponse:
        case_id = request.case_id
        user_text = request.message
        lang = request.language or "en"
        # Detect country and jurisdiction from natural language message
        jur_norm = jurisdiction_engine.detect_from_text(user_text, request.jurisdiction, request.country)

        # 1. Voice Input (BHASHINI ASR)
        if request.audio_base64:
            asr_text = await bhashini_service.speech_to_text(request.audio_base64, source_lang=lang)
            if asr_text:
                user_text = asr_text
                jur_norm = jurisdiction_engine.detect_from_text(user_text, request.jurisdiction, request.country)
            elif not user_text:
                logger.error("Bhashini ASR transcription failed for voice input.")
                return ChatResponse(
                    case_id=case_id,
                    message_id=str(uuid.uuid4())[:8],
                    answer="**Voice Recognition Notice**: Unable to transcribe your voice message using Bhashini ASR. Please check your audio input or type your message.",
                    jurisdiction=request.jurisdiction,
                    country=request.country,
                    relevant_ip_domains=[],
                    product_classification="unknown",
                    citations=[],
                    confidence_score=0.0,
                    confidence_explanation="ASR failure: Audio payload could not be transcribed by Bhashini.",
                    next_question="Please type your question directly.",
                    requires_human_escalation=False,
                    safe_abstention=True
                )

        # 2. Retrieve or Initialize CaseState
        existing_data = await firestore_service.get_case_state(case_id)
        if existing_data:
            case_state = CaseState(**existing_data)
            if request.language and request.language != "en":
                lang = request.language
                case_state.language = request.language
            elif case_state.language:
                lang = case_state.language
            if request.user_id and request.user_id != "guest_user" and case_state.user_id in ["guest_user", None]:
                case_state.user_id = request.user_id
        else:
            case_state = CaseState(
                case_id=case_id,
                user_id=request.user_id or "guest_user",
                language=lang,
                jurisdiction=jur_norm["jurisdiction"],
                country=jur_norm["country"],
                created_at=datetime.now().isoformat(),
                updated_at=datetime.now().isoformat()
            )

        case_state.jurisdiction = jur_norm["jurisdiction"]
        case_state.country = jur_norm["country"]
        case_state.language = lang

        # Translate input for reasoning if non-English
        processed_text = user_text
        if lang != "en":
            processed_text = await robust_translate(user_text, source_lang=lang, target_lang="en")

        # 3 & 4. Parallelized Parameter Extraction, Classification & IP Domain Routing
        state_task = case_orchestrator.extract_and_update_state(case_state, processed_text)
        class_task = classification_engine.classify_cumulative(case_state, processed_text)
        route_task = ip_router.route_case_domains(case_state, processed_text)

        case_state, class_res, route_res = await asyncio.gather(state_task, class_task, route_task)

        if class_res.get("classification") and class_res["classification"] != "unknown":
            case_state.formulation_classification = class_res["classification"]

        detected_domains = route_res.get("domains", [])
        for d in detected_domains:
            if d != "unknown" and d not in case_state.intellectual_property_objective:
                case_state.intellectual_property_objective.append(d)

        # 5. Check if query is a comparative statutory query
        lower_query = processed_text.lower()
        is_comparative_query = any(k in lower_query for k in [
            "compare", "comparison", "compare it with", "compare with", "difference between",
            "vs us", "vs epo", "vs german", "vs uspto", "vs uk", "vs japan", "vs china",
            "international standard law", "international standard", "another country", "foreign law"
        ])

        raw_answer = ""
        raw_citations = []
        evidence_context = None

        if is_comparative_query:
            target_country = jur_norm.get("country") if jur_norm.get("country") != "India" else "International"
            for k, c_name in jurisdiction_engine.COUNTRY_MAP.items():
                if k in lower_query:
                    target_country = c_name
                    break

            comp_res = await comparative_law_engine.compare_jurisdictions(
                ComparisonRequest(
                    case_id=case_id,
                    user_id=request.user_id,
                    target_country=target_country,
                    user_query=processed_text,
                    language="en"
                ),
                case_state
            )
            
            sections_summary = []
            for d in comp_res.dimensions:
                sections_summary.append(
                    f"#### 📌 {d.dimension}\n"
                    f"- **🇮🇳 Indian Law**: {d.india_law}\n"
                    f"- **🌐 {comp_res.target_country} Law**: {d.target_law}\n"
                    f"- **⚡ Key Difference**: {d.key_difference}\n"
                    f"- **💡 Strategic Implication**: {d.strategic_implication}"
                )
            raw_answer = (
                f"### ⚖️ {comp_res.comparison_title}\n\n"
                f"{comp_res.comparison_summary}\n\n"
                f"### Statutory Comparison Matrix\n\n"
                + "\n\n".join(sections_summary) +
                f"\n\n### 🗺️ Cross-Border Filing Roadmap\n"
                f"{comp_res.filing_pathway_advice}"
            )
            raw_citations = comp_res.citations
            evidence_context = EvidenceContext(
                selected_chunks=[],
                source_metadata=[],
                top_relevance_score=comp_res.confidence_score,
                authority_level="statutory",
                jurisdiction="Comparative",
                version="Current"
            )
        else:
            # 5b. Standard RAG Pipeline (Query Planner -> Retrieval -> Reranker -> EvidenceContext)
            evidence_context = await rag_retriever.execute_rag_pipeline(processed_text, case_state)

            # 6. Groq / LLM Answer Generation with EvidenceContext
            jurisdiction_prompt = jurisdiction_engine.get_jurisdiction_prompt_filter(jur_norm)
            evidence_prompt_text = evidence_context.to_formatted_prompt_text()
            lang_name = LANGUAGE_NAMES.get(lang, "English")

            system_prompt = (
                "You are IP-SAKTI Sahayak, an authoritative legal and regulatory AI assistant "
                "for Intellectual Property related to Ayurveda and Traditional Knowledge.\n"
                f"{jurisdiction_prompt}\n"
                "STRICT CONCISENESS & LEGAL SAFETY RULES:\n"
                "1. Base all legal claims ONLY on the provided RAG statutory EvidenceContext.\n"
                "2. Keep answers CRISP, DIRECT, and HIGH-IMPACT. Capped at MAXIMUM 5 to 8 bullet points total (NEVER exceed 10 points).\n"
                "3. Do NOT write long narrative essays or repetitive fluff.\n"
                "4. Never invent sections, acts, treaties, fees, or procedural deadlines."
            )

            if lang != "en":
                system_prompt += (
                    f"\n5. MANDATORY MULTILINGUAL REQUIREMENT: The user has selected the language '{lang_name}' ({lang}). "
                    f"You MUST generate the entire 'answer' text in {lang_name} using natural, authentic Indic script (e.g. Devanagari for Hindi/Marathi, Tamil script for Tamil, Telugu for Telugu, etc.). "
                    f"Do NOT write the 'answer' in English."
                )

            task_instruction = (
                f"Provide concise, high-impact informational guidance completely written in {lang_name} ({lang}) (MAX 5-8 BULLET POINTS TOTAL) using natural Indic script."
                if lang != "en"
                else "Provide concise, high-impact informational guidance (MAX 5-8 BULLET POINTS TOTAL)."
            )

            user_prompt = f"""
Case Parameters:
- Jurisdiction: {case_state.jurisdiction} ({case_state.country or 'India'})
- Formulation Category: {case_state.formulation_classification}
- Relevant IP Domains: {', '.join(case_state.intellectual_property_objective)}
- Target Language: {lang_name} ({lang})

Authoritative RAG Statutory Evidence Context:
{evidence_prompt_text}

User Query:
{processed_text}

Task:
{task_instruction}
List explicit statutory section citations.

Return JSON:
{{
  "answer": "Concise guidance formatted in maximum 5-8 bullet points written completely in {lang_name} ({lang}) script",
  "citations": [
    {{
      "source": "Exact Statute Title",
      "section_or_rule": "Section number",
      "jurisdiction": "{case_state.jurisdiction}",
      "effective_date": "Year/Date"
    }}
  ]
}}
"""

            try:
                groq_res = await groq_provider.generate_structured_json(user_prompt, system_prompt)
                answer_val = groq_res.get("answer", "")
                if isinstance(answer_val, list):
                    raw_answer = "\n".join([f"- {str(item)}" for item in answer_val])
                else:
                    raw_answer = str(answer_val or "")

                for c in groq_res.get("citations", []):
                    raw_citations.append(Citation(
                        source=c.get("source", "Authoritative Source"),
                        section_or_rule=c.get("section_or_rule"),
                        jurisdiction=c.get("jurisdiction", case_state.jurisdiction),
                        effective_date=c.get("effective_date"),
                        is_authoritative=True
                    ))
            except Exception as e:
                logger.warning(f"Groq generation error: {e}. Assembling fallback guidance directly from statutory evidence context.")

            if not raw_answer and not evidence_context.is_empty():
                sections_summary = []
                for chunk in evidence_context.selected_chunks:
                    sec_title = chunk.section or chunk.article or "General Provision"
                    sections_summary.append(
                        f"#### {chunk.title} — {sec_title}\n"
                        f"**Authority**: {chunk.authority} | **Jurisdiction**: {chunk.jurisdiction}\n\n"
                        f"> *\"{chunk.text}\"*\n"
                    )
                    raw_citations.append(Citation(
                        source=chunk.title,
                        section_or_rule=sec_title,
                        jurisdiction=chunk.jurisdiction,
                        effective_date=chunk.version or "Current",
                        snippet=chunk.text[:200],
                        is_authoritative=True
                    ))

                raw_answer = (
                    f"### Executive Legal Guidance ({case_state.jurisdiction})\n\n"
                    f"Based on authoritative statutory registers for **{case_state.product_type or 'Ayurvedic formulation'}**, "
                    f"the following legal and regulatory provisions apply under {case_state.jurisdiction} law:\n\n"
                    + "\n\n".join(sections_summary) +
                    "\n\n### Actionable Next Steps for Innovators\n"
                    "1. **Prior Art & TKDL Check**: Verify that active medicinal herbs are not documented as public prior art in classical texts under Section 3(p).\n"
                    "2. **Synergistic Efficacy Data**: If combining multiple biological ingredients, conduct comparative efficacy studies to overcome Section 3(e) admixture objections.\n"
                    "3. **NBA / ABS Compliance**: If sourcing biological materials from India, file Form I / Form III intimation with the National Biodiversity Authority (NBA).\n"
                )
            elif not raw_answer:
                raw_answer = "I do not have sufficient verified statutory evidence in the legal index to answer this query with high confidence."


        # 7. Claim Extraction & Citation Validation
        extracted_claims = await claim_extractor.extract_claims(raw_answer)
        validated_cits, is_valid_cit, unsupported = citation_validator.validate_claims_and_citations(
            raw_citations=raw_citations,
            evidence_context=evidence_context,
            target_jurisdiction=case_state.jurisdiction,
            target_country=case_state.country,
            extracted_claims=extracted_claims
        )

        # 8. Evidence Confidence & Safe Abstention Check
        conf_score, conf_level, conf_exp, safe_abstain = confidence_engine.calculate_evidence_confidence(
            evidence_context=evidence_context,
            validated_citations=validated_cits,
            jurisdiction=case_state.jurisdiction
        )
        case_state.confidence = conf_score

        final_answer = raw_answer
        if safe_abstain:
            final_answer = (
                f"**Safe Abstention Notice ({case_state.jurisdiction})**:\n"
                "I do not have sufficient verified statutory evidence in the legal index to answer this specific query with complete authority.\n\n"
                "To prevent inaccurate legal guidance, please consult an official AYUSH IP attorney or use the Human Escalation option."
            )

        # 8b. Prior-Art & Existing-Record Retrieval (Separated from legal verdict)
        is_patent_case = (
            bool(case_state.ingredients) or
            "patent" in [d.lower() for d in case_state.intellectual_property_objective] or
            case_state.formulation_classification in ["proprietary", "new_non_classical", "phytopharmaceutical", "classical", "unknown"] or
            "patent" in processed_text.lower() or
            "prior art" in processed_text.lower() or
            "similar" in processed_text.lower() or
            "herbal" in processed_text.lower() or
            "extract" in processed_text.lower() or
            "formulation" in processed_text.lower() or
            bool(case_state.novelty_aspect or case_state.technical_improvement)
        )
        
        prior_art_matches = None
        prior_art_res = None
        if is_patent_case:
            prior_art_res = await prior_art_matcher.search_prior_art(case_state, user_query=processed_text)
            if prior_art_res and prior_art_res.matches:
                prior_art_matches = prior_art_res.matches

        requires_escalation = safe_abstain
        # Public Disclosure Warning (Part 12)
        if is_patent_case and case_state.public_disclosure:
            disclosure_notice = (
                "\n\n> ⚠️ **Notice on Prior Public Disclosure**:\n"
                "> Public disclosure may be relevant to patent filing strategy. "
                "The assistant cannot determine the legal effect without jurisdiction-specific review."
            )
            final_answer += disclosure_notice
            requires_escalation = True

        if prior_art_res and prior_art_res.requires_human_escalation:
            requires_escalation = True

        # 9. Dynamic Next Question Generation
        q_res = await questioning_engine.generate_next_question(case_state)
        next_question = q_res.next_question if not q_res.is_clarification_complete else None

        # If clarification is complete or cap reached, but essential parameters remain missing, attach Incomplete Information Notice
        if q_res.is_clarification_complete and case_state.missing_information:
            missing_labels = [case_state_manager.MANDATORY_FIELDS.get(f, f.replace('_', ' ')) for f in case_state.missing_information]
            insufficient_info_notice = (
                f"\n\n> ⚠️ **Notice on Incomplete Formulation Information**:\n"
                f"> Key parameters ({', '.join(missing_labels)}) were not fully disclosed. "
                f"Without these specific details, a definitive statutory determination under patent and biodiversity laws (e.g. Section 3(p) TKDL prior art bar or Section 3(e) synergistic efficacy defense) cannot be finalized. "
                f"The assessment above provides general statutory legal frameworks."
            )
            final_answer += insufficient_info_notice

        # 10. Multilingual Translation & TTS Audio
        translated_options = q_res.suggested_options if next_question else None
        if lang != "en":
            try:
                final_answer = await robust_translate(final_answer, source_lang="en", target_lang=lang)
                if next_question:
                    next_question = await robust_translate(next_question, source_lang="en", target_lang=lang)
                if translated_options:
                    translated_options = [await robust_translate(opt, source_lang="en", target_lang=lang) for opt in translated_options]
            except Exception as e:
                logger.error(f"Response translation failed (en -> {lang}): {e}")

        # Record complete translated turn into conversation_history
        turn_record = {
            "user_message": user_text,
            "assistant_answer": final_answer,
            "next_question": next_question,
            "suggested_options": translated_options,
            "citations": [c.model_dump() for c in validated_cits],
            "question": next_question,
            "timestamp": datetime.now().isoformat()
        }
        case_state.conversation_history.append(turn_record)

        wants_audio = bool(request.audio_base64 or getattr(request, "enable_audio_output", False))
        audio_output = await bhashini_service.text_to_speech(final_answer[:200], target_lang=lang) if wants_audio else None

        # Save updated state
        await firestore_service.save_case_state(case_id, case_state.model_dump())

        # 11. Comparison Options for Indian Law Consultations
        comparison_options = None
        if case_state.jurisdiction == "India" or "india" in str(case_state.jurisdiction).lower():
            comparison_options = [
                "🌐 Compare with International Standards (WIPO/PCT/Nagoya)",
                "🇺🇸 Compare with US Law (USPTO - 35 U.S.C.)",
                "🇪🇺 Compare with European Law (EPO / EPC)",
                "🇩🇪 Compare with German Law (DPMA / PatG)"
            ]
            if lang != "en":
                try:
                    comparison_options = [await robust_translate(opt, source_lang="en", target_lang=lang) for opt in comparison_options]
                except Exception as e:
                    logger.error(f"Comparison options translation error: {e}")

        return ChatResponse(
            case_id=case_id,
            message_id=str(uuid.uuid4())[:8],
            answer=final_answer,
            jurisdiction=case_state.jurisdiction,
            country=case_state.country,
            relevant_ip_domains=detected_domains,
            product_classification=case_state.formulation_classification,
            citations=validated_cits,
            confidence_score=conf_score,
            confidence_explanation=conf_exp,
            next_question=next_question,
            suggested_options=translated_options,
            prior_art_matches=prior_art_matches,
            audio_url=audio_output,
            requires_human_escalation=requires_escalation,
            safe_abstention=safe_abstain,
            comparison_options=comparison_options
        )


conversation_pipeline = ConversationPipeline()

