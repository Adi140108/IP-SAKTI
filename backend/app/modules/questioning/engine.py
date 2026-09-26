import logging
from typing import Dict, Any, List, Optional
from app.ai.gemma.provider import gemma_provider
from app.case.models import CaseState
from app.schemas.case import QuestioningResponse

logger = logging.getLogger("IP-SAKTI.QuestioningEngine")

class DynamicQuestioningEngine:
    """
    Adaptive Dynamic Questioning Engine with distinct sub-engines for:
    - India Domestic Law (Sec 3(p), Sec 3(e), NBA Form I/III ABS, FSSAI Ayurveda-Aahar)
    - International Treaties & Foreign Country Filing (PCT Art 15, Nagoya Protocol, USPTO 35 U.S.C 101/102, EPO EPC 52/54)
    STRICT RULE: Never repeats previously asked questions.
    """

    MANDATORY_DESCRIPTIONS = {
        "jurisdiction": "Target Jurisdiction (India domestic law vs International market regimes)",
        "product_type": "Formulation type (e.g., herbal powder [Churnam], oil [Taila], extract, tablet, beverage)",
        "classical_reference": "Whether the product is from a classical text (e.g., Charaka Samhita) or a novel proprietary formula",
        "ingredients": "Active biological ingredients or medicinal herbs used in the formulation",
        "traditional_knowledge_involved": "Whether traditional knowledge or public prior art is utilized",
        "biological_resources_involved": "Whether biological resources harvested from India are accessed (ABS trigger)",
        "intellectual_property_objective": "Primary legal protection sought (Patent, Trademark, GI, Design, ABS approval)"
    }

    async def detect_information_gaps(self, state: CaseState) -> List[str]:
        """Detect information gaps in the cumulative CaseState."""
        from app.case.state_manager import case_state_manager
        return case_state_manager.compute_missing_information(state)

    def _get_previous_asked_questions(self, state: CaseState) -> List[str]:
        """Extract list of questions previously asked in conversation history."""
        asked = []
        for turn in state.conversation_history:
            if isinstance(turn, dict) and "question" in turn and turn["question"]:
                asked.append(str(turn["question"]).lower().strip())
        return asked

    async def generate_next_question(self, state: CaseState) -> QuestioningResponse:
        """Route to India or International Question Engine based on active state jurisdiction."""
        missing_info = state.missing_information

        if not missing_info:
            return QuestioningResponse(
                next_question="All key case parameters have been gathered. Ready to generate complete legal guidance.",
                detected_missing_info=[],
                is_clarification_complete=True,
                suggested_options=None
            )

        asked_history = self._get_previous_asked_questions(state)

        # Filter out priority fields whose questions were already asked recently
        unasked_fields = []
        for field in missing_info:
            unasked_fields.append(field)

        priority_field = unasked_fields[0] if unasked_fields else missing_info[0]
        jur = (state.jurisdiction or "India").lower()
        country_name = state.country or ("India" if jur == "india" else "Global Market")

        # -------------------------------------------------------------
        # 1. INDIA DOMESTIC LAW QUESTION ENGINE
        # -------------------------------------------------------------
        INDIA_EXPERT_MAP = {
            "product_type": (
                "What specific dosage form or delivery mechanism does your Ayurvedic formulation use under Indian regulations?",
                ["Herbal Extract / Phytochemical", "Classical Powder / Oil [Churnam / Taila]", "Proprietary Capsule / Tablet", "Ayurveda-Aahar Beverage / Cosmetic"]
            ),
            "classical_reference": (
                "Is your formulation derived from First Schedule classical Ayurvedic texts (e.g. Charaka Samhita), or is it a novel proprietary formula?",
                ["Classical Text Reference Exists", "Modified Proprietary Formulation", "Completely Novel Invention"]
            ),
            "traditional_knowledge_involved": (
                "Is classical Ayurvedic traditional knowledge prior art involved under Section 3(p), or do you have synergistic efficacy data for Section 3(e)?",
                ["Yes, Traditional Knowledge Involved", "No, Novel Scientific Formula"]
            ),
            "biological_resources_involved": (
                "Are the medicinal herbs or biological materials in your formulation sourced within India, requiring National Biodiversity Authority (NBA) approval?",
                ["Yes, Indian Biological Resources Used (ABS)", "No Biological Resources Sourced from India"]
            ),
            "ingredients": (
                "What active medicinal herbs or biological resources (e.g. Ashwagandha, Guduchi, Turmeric) are in your product?",
                ["Ashwagandha & Turmeric", "Brahmi & Neem", "Tulsi & Ginger", "Other Medicinal Herbs"]
            ),
            "intellectual_property_objective": (
                "What primary legal protection objective are you pursuing in India?",
                ["Patent Protection", "Trademark Registration", "Geographical Indication [GI]", "NBA / ABS Clearance"]
            )
        }

        # -------------------------------------------------------------
        # 2. INTERNATIONAL & FOREIGN COUNTRY QUESTION ENGINE
        # -------------------------------------------------------------
        INTL_EXPERT_MAP = {
            "product_type": (
                f"For filing clearance in {country_name}, what form does your biological formulation take under PCT / foreign standards?",
                ["Purified Botanical Extract", "Phytochemical Active Compound", "Dietary Supplement / Natural Medicine", "Classical Herbal Composition"]
            ),
            "classical_reference": (
                f"Under foreign prior art rules (USPTO 35 U.S.C 102 / EPO Art 54), is your product documented in public traditional knowledge prior art?",
                ["Public Traditional Knowledge Prior Art", "Novel Proprietary Formula", "Patented Synthetic Extract"]
            ),
            "traditional_knowledge_involved": (
                f"Under international Nagoya Protocol Articles 5 & 6, does your product utilize genetic resources or associated traditional knowledge from India?",
                ["Yes, Traditional Knowledge Involved", "No, Novel Scientific Formula"]
            ),
            "biological_resources_involved": (
                f"Do you require Nagoya Protocol Prior Informed Consent (PIC) & Mutually Agreed Terms (MAT) to export biological material to {country_name}?",
                ["Yes, Indian Biological Resources Used (ABS)", "No Biological Resources Sourced from India"]
            ),
            "ingredients": (
                f"Which botanical active ingredients in your formula require subject matter eligibility disclosure under foreign patent laws for {country_name}?",
                ["Ashwagandha & Turmeric", "Brahmi & Neem", "Tulsi & Ginger", "Other Medicinal Herbs"]
            ),
            "intellectual_property_objective": (
                f"What international patent pathway are you pursuing for {country_name}?",
                ["WIPO PCT International Application", f"Direct National Filing in {country_name}", "Nagoya Protocol ABS Clearance"]
            )
        }

        target_map = INTL_EXPERT_MAP if jur == "international" else INDIA_EXPERT_MAP

        # Check if priority field question was already asked in history
        for field in unasked_fields:
            if field in target_map:
                q_text, opts = target_map[field]
                # Check if this exact question was already asked in previous turn
                if not any(q_text.lower() in prev_q for prev_q in asked_history):
                    logger.info(f"Dynamic Questioning Engine ({state.jurisdiction} - {country_name}) field '{field}': {q_text}")
                    return QuestioningResponse(
                        next_question=q_text,
                        detected_missing_info=missing_info,
                        is_clarification_complete=False,
                        suggested_options=opts
                    )

        # Fallback if all mapped questions were asked or non-standard field
        prompt = f"""
Given the Cumulative Ayurvedic IP Case State:
- Jurisdiction: {state.jurisdiction} ({country_name})
- Known Parameters: {', '.join(state.known_information) if state.known_information else 'None'}
- Missing Information: {', '.join(missing_info)}

Task: Generate ONE specific follow-up question for {country_name} ({state.jurisdiction}) that has NOT been asked before.
Return JSON:
{{
  "next_question": "Question string",
  "suggested_options": ["Option 1", "Option 2", "Option 3"]
}}
"""
        system_prompt = f"You are the Dynamic Questioning Engine for IP-SAKTI ({state.jurisdiction})."
        try:
            res = await gemma_provider.generate_structured_json(prompt, system_prompt)
            return QuestioningResponse(
                next_question=res.get("next_question", f"Could you clarify the specific medicinal parameters for {country_name}?"),
                detected_missing_info=missing_info,
                is_clarification_complete=False,
                suggested_options=res.get("suggested_options", ["Herbal Extract", "Classical Text Formula", "Proprietary Compound"])
            )
        except Exception:
            return QuestioningResponse(
                next_question=f"Could you clarify the specific medicinal ingredients and target claims for {country_name}?",
                detected_missing_info=missing_info,
                is_clarification_complete=False,
                suggested_options=["Herbal Extract", "Classical Text Formula", "Proprietary Compound"]
            )

questioning_engine = DynamicQuestioningEngine()

